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
  return ( value / 100 ).toFixed( 2 );
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
  let nameWidth = 0;
  for ( const {
    name,
  } of byLedgerAccount.keys() ) {
    nameWidth = Math.max( nameWidth, name.length );
  }

  let totalAmount = 0;
  let totalOutstandingAmount = 0;
  for ( const [ ledgerAccount, amounts ] of byLedgerAccount ) {
    const amount = amounts.reduce( sum, 0 );
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

  console.log( [
    "".padEnd( nameWidth ),
    formatCents( totalAmount ).padStart( 8 ),
    formatCents( totalOutstandingAmount ).padStart( 8 ),
  ].join( "\t" ) )
}
