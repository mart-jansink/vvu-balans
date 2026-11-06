import {
  startMonth,
  endMonth,
} from "./argv.mjs";

import fetch, {
  fetchFinancialMutation,
  fetchInvoice,
  fetchDocument,
  fetchPayment,
} from "./fetch/index.mjs";

import {
  flatChildren,
  parseCents,
  paginate,
  print,
} from "./util.mjs";

const ledgerAccountsById = new Map();
for ( const ledgerAccount of await fetch( "ledger_accounts.json" ) ) {
  ledgerAccountsById.set( ledgerAccount.id, ledgerAccount );
}
for ( const ledgerAccount of ledgerAccountsById.values() ) {
  ledgerAccount.parent = ledgerAccountsById.get( ledgerAccount.parent_id );
}

const taxRatesById = new Map();
for ( const taxRate of await fetch( "tax_rates.json" ) ) {
  taxRatesById.set( taxRate.id, taxRate );
}
const includeTax = function( {
  tax_rate_id,
  total_price_excl_tax_with_discount_base,
} ) {
  return parseCents( total_price_excl_tax_with_discount_base );

  const {
    percentage,
  } = taxRatesById.get( tax_rate_id );

  return ( parseCents( total_price_excl_tax_with_discount_base ) * (
    ( 1 + ( percentage ? ( parseFloat( percentage ) / 100 ) : 0 )
  ) ) );
}

// list each month between the start and end one because we only seem to be
// allowed to fetch reports one month at the time
const months = [];
for ( let m = startMonth; m <= endMonth; ++m ) {
  months.push( m );

  if ( ( m % 100 ) === 12 ) {
    m += 88;
  }
}

const lookupContact = async function( {
  invoice_type,
  invoice_id,
} ) {
  switch ( invoice_type ) {
    case "SalesInvoice":
    case "ExternalSalesInvoice":
      return ( await fetchInvoice( invoice_id, invoice_type ) ).contact;

    case "Document":
      return ( await fetchDocument( invoice_id ) ).contact;
  }
}

const maybeMatchDetails = function( {
  details,
}, amount ) {
  // TODO: work out how much has already been paid in the mean time

  let totalPrice = 0;
  for ( const detail of details ) {
    // TODO: maybe apply any tax rate
    const price = includeTax( detail );
    totalPrice += price;

    if ( price === amount ) {
      if ( detail._matched ) {
        // don't match e.g. multiple payments to the same detail in case their
        // ledger accounts differ (we ensure a stable array of details for each
        // document / invoice by caching those objects)
        continue;
      }
      detail._matched = true;

      return [
        [
          detail.ledger_account_id,
          amount,
        ],
      ];
    }
  }

  // fall back on distributing this amount across all remaining details
  const fraction = ( amount / totalPrice );
  return details.map( ( detail ) => [
    detail.ledger_account_id,
    ( includeTax( detail ) * fraction ),
  ] );
};

const balanceLedgerAccounts = async function( current ) {
  const duplicateFinancialMutationEntries = new Map();
  const byContactId = new Map();
  for ( let {
    ledger_account_id,
    value,
  } of current.map( flatChildren ).flat() ) {
    const ledgerAccount = ledgerAccountsById.get( ledger_account_id );
    if ( ledgerAccount.taxonomy_item.code.startsWith( "BLimBanRb" ) ) {
      // don't attribute the transactions on a bank account to the various
      // ledger accounts
      continue;
    }

    // TODO: automatically check that this value equals the total amount from
    // below
    value = parseCents( value );

    for ( const month of months ) {
      for await ( const entry of paginate( `reports/journal_entries.json?ledger_account_id=${ ledger_account_id }&period=${ month }` ) ) {
        const {
          document_type,
          document_id,

          contact_id,

          amount,
        } = entry;
        entry.amount = parseCents( amount );

        // if ( document_id !== "454553936374793305" ) {
        //   continue;
        // }

        let byId = byContactId.get( contact_id );
        if ( !byId ) {
          byContactId.set( contact_id, (
            byId = new Map()
          ) );
        }

        if ( byId.has( entry.id ) ) {
          if ( document_type !== "FinancialMutation" ) {
            // other documents can only pertain to a single contact so just
            // increment the previous amount accordingly
            byId.get( entry.id ).amount += entry.amount;
            continue;
          }

          // in contrast, track duplicate financial mutation entries, because it
          // probably means that some other contact is missing this one due to
          // an apparent bug at Moneybird (it only happens with large financial
          // mutations corresponding to direct debits, maybe it has to do
          // something with an unstable pagination)
          duplicateFinancialMutationEntries.set( entry.document_id, entry );
        }
        byId.set( entry.id, entry );
      }
    }
  }

  // resolve the duplicate financial mutation entries by looking up the payments
  // made for each of them, attributing those to the contact of the
  // corresponding (external) sales invoice
  for ( const entry of duplicateFinancialMutationEntries.values() ) {
    const {
      document_type,
      document_id,
    } = entry;

    const {
      payments,
    } = await fetchFinancialMutation( document_id );
    for ( const payment of payments ) {
      const contact = await lookupContact( payment );

      const byId = byContactId.get( contact.id );
      for ( const otherEntry of byId.values() ) {
        if ( otherEntry.document_id === document_id ) {
          byId.delete( otherEntry.id );
        }
      }
      byId.set( entry.id, {
        ...entry,

        contact_id: contact.id,
        amount: -parseCents( payment.price ),
      } );
    }
  }

  // assume that corresponding ±amounts pertain to the same ledger account and
  // therefore cancel each other out
  for ( const [ contact_id, byId ] of byContactId ) {
    let totalAmount = 0;
    for ( const {
      amount,
    } of byId.values() ) {
      totalAmount += amount;
    }
    if ( totalAmount === 0 ) {
      byContactId.delete( contact_id );
      continue;
    }

    // prefer canceling out another entry of the same document type (e.g.
    // financial mutations) to reduce the amount of lookups needed later on
    for ( const equalDocumentType of [ true, false ] ) {
      nextEntry: for ( const entry of byId.values() ) {
        for ( const otherEntry of byId.values() ) {
          if ( entry.amount === -otherEntry.amount ) {
            if ( ( entry.document_type === otherEntry.document_type ) === equalDocumentType ) {
              byId.delete( entry.id );
              byId.delete( otherEntry.id );
              continue nextEntry;
            }
          }
        }
      }
    }
  }

  const documentsById = new Map();
  const invoicesById = new Map();
  const attributeAmounts = async function( entry, amount = entry.amount ) {
    const {
      contact_id,

      invoice_type,
      invoice_id,

      document_type = invoice_type,
      document_id = invoice_id,
    } = entry;

    switch ( document_type ) {
      case "Document":
        const document = await fetchDocument( document_id );
        documentsById.set( document.id, document );
        return maybeMatchDetails( document, amount );

      case "SalesInvoice":
      case "ExternalSalesInvoice":
        const invoice = await fetchInvoice( document_id, document_type );
        invoicesById.set( invoice.id, invoice );
        return maybeMatchDetails( invoice, amount );

      case "FinancialMutation":
        const {
          payments,
        } = await fetchFinancialMutation( document_id );
        if ( !payments.length ) {
          return [];
        }

        // try to find a payment matching this amount and contact
        for ( const payment of payments ) {
          if ( -parseCents( payment.price ) !== amount ) {
            continue;
          }

          const contact = await lookupContact( payment );
          if ( contact.id !== contact_id ) {
            continue;
          }

          return attributeAmounts( payment, amount );
        }

        // assume that there was just one relevant payment to begin with
        return attributeAmounts( payments[ 0 ], amount );

      case "Payment":
        return attributeAmounts( await fetchPayment( document_id ), amount );

      case "VatDocument":
        // TODO: figure out how to handle this
        return [];

      default:
        throw entry;
    }
  };

  const byLedgerAccount = new Map();
  byLedgerAccount.outstanding = new Map();
  for ( const ledgerAccount of ledgerAccountsById.values() ) {
    byLedgerAccount.set( ledgerAccount, [] );
    byLedgerAccount.outstanding.set( ledgerAccount, [] );
  }

  for ( const byId of byContactId.values() ) {
    for ( const entry of byId.values() ) {
      for ( const [ ledgerAccountId, amount ] of await attributeAmounts( entry ) ) {
        const ledgerAccount = ledgerAccountsById.get( ledgerAccountId );
        byLedgerAccount.get( ledgerAccount ).push( amount );
      }
    }
  }

  for ( const {
    details,
    payments,
  } of [
    ...documentsById.values(),
    ...invoicesById.values(),
  ] ) {
    let totalPrice = 0;
    for ( const detail of details ) {
      totalPrice += includeTax( detail );
    }

    let totalPaid = 0;
    for ( const payment of payments ) {
      totalPaid += parseCents( payment.price_base );
    }

    const fraction = ( 1 - ( totalPaid / totalPrice ) );
    for ( const detail of details ) {
      const ledgerAccount = ledgerAccountsById.get( detail.ledger_account_id );
      byLedgerAccount.outstanding.get( ledgerAccount ).push(
        ( includeTax( detail ) * fraction ),
      );
    }
  }

  return byLedgerAccount;
};

const {
  debit,
  credit,
} = await fetch( `reports/balance_sheet.json?period=${ endMonth }` );

const debitBalance = await balanceLedgerAccounts( debit.current_assets );
console.log( "\ndebit" );
print( debitBalance );

const creditBalance = await balanceLedgerAccounts( credit.current_liabilities );
console.log( "\ncredit" );
print( creditBalance );
