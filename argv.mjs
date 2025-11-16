import yargs from "yargs"
import {
  hideBin,
} from "yargs/helpers";

export const {
  argv: {
    token,
    administrationId,

    startMonth,
    endMonth,

    verbose,
  },
} = yargs( hideBin( process.argv ) )
  .option( "token", {
    alias: "t",
  } )
  .option( "administration-id", {
    alias: "a",
  } )
  .option( "start-month", {
    alias: "s",
    transform: parseInt,
  } )
  .option( "end-month", {
    alias: "e",
    transform: parseInt,
  } )
  .option( "verbose", {
    alias: "v",
    boolean: true,
  } )
  .demandOption( [
    "token",
    "administration-id",

    "start-month",
    "end-month",
  ] );
