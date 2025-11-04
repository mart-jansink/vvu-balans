import {
  createHash,
} from "crypto";

import {
  mkdir,

  readFile,
  writeFile,
} from "fs/promises";

import {
  join,
} from "path";

import fetch from "./retry.mjs";

await mkdir( ".cache", {
  recursive: true,
} );

export default async function cachedFetch( url, options = {} ) {
  const key = createHash( "md5" );
  key.update( url );
  key.update( JSON.stringify( options ) );

  const cache = join( ".cache", key.digest( "hex" ) );
  try {
    const result = await readFile( cache, "utf-8" );
    try {
      return JSON.parse( result );
    }
    catch {
      const [ status, ...error ] = result.split( ";" );
      throw new Error( error.join( ";" ) );
    }
  }
  catch ( error ) {
    if ( error.code !== "ENOENT" ) {
      throw error;
    }

    const response = await fetch( url, options );
    const body = await response.text();

    if ( response.status !== 200 ) {
      let error = body;
      try {
        ( {
          error,
        } = JSON.parse( body ) );
      }
      catch {}

      await writeFile( cache, [
        response.status,
        error,
      ].join( ";" ) );
      throw new Error( error );
    }

    await writeFile( cache, body );
    return JSON.parse( body );
  }
}
