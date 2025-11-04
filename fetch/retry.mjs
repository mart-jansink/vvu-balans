const throttling = ( 5 * 60 * 1000 / 150 );

export default async function retriedFetch( url, options ) {
  const then = Date.now();
  const response = await fetch( url, options );

  if ( response.status !== 429 ) {
    return new Promise( ( resolve ) => {
      setTimeout(
        resolve,
        Math.max( 100, ( throttling - ( Date.now() - then ) ) ),

        response,
      );
    } );
  }

  const retryAfter = parseInt( response.headers.get( "retry-after" ), 10 );
  console.log( new Date( retryAfter * 1000 ).toLocaleTimeString() );

  return new Promise( ( resolve ) => {
    setTimeout(
      resolve,
      ( ( retryAfter * 1000 ) - Date.now() ),
    );
  } ).then( () => retriedFetch( url, options ) );
}
