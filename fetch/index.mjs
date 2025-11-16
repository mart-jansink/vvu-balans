import {
  token,
  administrationId,

  verbose,
} from "../argv.mjs";

import fetch from "./cache.mjs";

export default async function authorizedFetch( path, options = {} ) {
  if ( verbose ) {
    console.error( path );
  }

  return fetch( `https://moneybird.com/api/v2/${ administrationId }/${ path }`, {
    ...options,

    headers: {
      ...options.headers,

      Authorization: `Bearer ${ token }`,
    },
  } );
};

export const fetchFinancialMutation = function( financialMutationId ) {
  return authorizedFetch( `financial_mutations/${ financialMutationId }.json` );
};

const invoicesById = new Map();
export const fetchInvoice = async function( invoiceId, invoiceType ) {
  if ( invoicesById.has( invoiceId ) ) {
    return invoicesById.get( invoiceId );
  }

  let path = `sales_invoices/${ invoiceId }.json`;
  switch ( invoiceType ) {
    case "SalesInvoice":
      break;

    case "ExternalSalesInvoice":
      path = `external_${ path }`;
      break;

    default:
      throw new Error( `Unexpected invoice type "${ invoiceType }".` );
  }

  const invoice = await authorizedFetch( path );
  invoicesById.set( invoiceId, invoice );

  return invoice;
}

const documentsById = new Map();
export const fetchDocument = async function( documentId ) {
  if ( documentsById.has( documentId ) ) {
    return documentsById.get( documentId );
  }

  let lastError;
  for ( const type of [
    "purchase_invoices",
    "receipts",
    "general_journal_documents",
  ] ) {
    try {
      const document = await authorizedFetch( `documents/${ type }/${ documentId }.json` );
      documentsById.set( documentId, document );

      return document;
    }
    catch ( error ) {
      lastError = error;
    }
  }

  throw lastError;
};

export const fetchPayment = function( paymentId ) {
  return authorizedFetch( `payments/${ paymentId }.json` );
};
