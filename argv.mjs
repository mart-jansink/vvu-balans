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
  .demandOption( [
    "token",
    "administration-id",

    "start-month",
    "end-month",
  ] );
