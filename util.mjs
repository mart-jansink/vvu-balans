import fetch from "./fetch/index.mjs";

export const flatChildren = function( entry ) {
  const {
    children,
  } = entry;
  return ( children?.length ? children : entry );
};

export const parseCents = function( value ) {
  if ( typeof value === "number" ) {
    return value;
  }

  return Math.round( parseFloat( value ) * 100 );
};
const formatCents = function( value ) {
  return ( value / 100 ).toFixed( 2 ).replace( ".", "," );
};

const perPage = 100;
export const paginate = async function * ( path, options ) {
  path += `${ path.includes( "?" ) ? "&" : "?" }per_page=${ perPage }`;

  let page = 1;
  while ( true ) {
    const result = await fetch( `${ path }&page=${ page }`, options );
    if ( result.length === 0 ) {
      return;
    }

    yield * result;
    if ( result.length < perPage ) {
      return;
    }

    ++page;
  }
};

const sum = function( sum, amount ) {
  return ( sum + amount );
}
export const print = function( byLedgerAccount ) {
  const ledgerAccountsByParent = new Map();
  let nameWidth = 0;
  for ( const [ ledgerAccount, amounts ] of byLedgerAccount ) {
    if ( amounts.length === 0 ) {
      continue;
    }

    const {
      parent,
    } = ledgerAccount;
    if ( ledgerAccountsByParent.has( parent ) ) {
      ledgerAccountsByParent.get( parent ).push( ledgerAccount );
    }
    else {
      ledgerAccountsByParent.set( parent, [ ledgerAccount ] );
    }

    if ( ledgerAccount.name.startsWith( parent.name ) ) {
      ledgerAccount.name = ledgerAccount.name.slice( parent.name.length + 1 );
    }
    nameWidth = Math.max( nameWidth, ledgerAccount.name.length, parent.name.length );
  }

  let totalAmount = 0;
  let totalOutstandingAmount = 0;
  for ( const parent of Array.from( ledgerAccountsByParent.keys() ).sort( ( a, b ) => {
    return a.name.localeCompare( b.name );
  } ) ) {
    console.log( `\n${ parent.name }` );

    for ( const ledgerAccount of ledgerAccountsByParent.get( parent ) ) {
      const amount = byLedgerAccount.get( ledgerAccount ).reduce( sum, 0 );
      totalAmount += amount;

      if ( Math.abs( Math.round( amount ) ) <= 99 ) {
        // disregard any (cumulative) rounding errors
        continue;
      }

      const outstandingAmount = byLedgerAccount.outstanding.get( ledgerAccount ).reduce( sum, 0 );
      totalOutstandingAmount += outstandingAmount;

      console.log( [
        ledgerAccount.name.padEnd( nameWidth ),
        formatCents( amount ).padStart( 8 ),

        ( ( Math.abs( outstandingAmount ) > 99 )
          ? formatCents( outstandingAmount ).padStart( 8 )
          : ""
        ),
      ].join( "\t" ) );
    }
  }

  console.log( "\n", [
    "".padEnd( nameWidth ),
    formatCents( totalAmount ).padStart( 8 ),
    formatCents( totalOutstandingAmount ).padStart( 8 ),
  ].join( "\t" ) )
}
