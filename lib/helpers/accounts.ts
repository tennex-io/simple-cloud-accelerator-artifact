import { accounts } from "@config/coreConfig";
import { Account, shortAccountName } from "@lib/types";

/**
 *
 * Get account details from AWS account ID
 *
 * @param  {string} id
 * @returns Account
 */
export function getAccountFromId(id: string): Account {
  const account = accounts.filter((acct) => acct.id === id);

  if (account === undefined || account.length === 0) {
    const validAccounts = accounts.map((account) => `  ${account.id} (${account.name})`).join("\n");
    throw new Error(`Account with ${id} does not exist in the accounts object.\nValid accounts are:\n${validAccounts}`);
  }
  return account[0];
}

/**
 *
 * Get account details from the short/friendly name
 *
 * @param  {shortAccountName} name
 * @returns Account
 */
export function getAccountFromShortName(name: shortAccountName): Account {
  const account = accounts.filter((acct) => acct.name === name);

  if (account === undefined) {
    throw new Error(`Account named ${name} does not exist in the accounts object.`);
  }

  return account[0];
}
