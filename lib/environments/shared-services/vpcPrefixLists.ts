import { prefixLists } from "@config/coreConfig";
import { SharedPrefixList } from "@constructs/sharedPrefixList";
import { getAccountFromShortName } from "@helpers/accounts";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface VpcPrefixListsProps extends StackProps {
  listDetails: typeof prefixLists;
  /**
   * AWS Organization ID of the Management Account
   *
   * @example o-123456
   */
  organizationId: string;
}

export class VpcPrefixLists extends Stack {
  constructor(scope: Construct, id: string, props: VpcPrefixListsProps) {
    super(scope, id, props);

    const organizationAccountId = getAccountFromShortName("organization").id;
    const organizationArn = `arn:aws:organizations::${organizationAccountId}:organization/${props.organizationId}`;

    Object.entries(props.listDetails).forEach(([name, cidrs]) => {
      new SharedPrefixList(this, name, {
        prefixListName: name,
        sharePrincipals: [organizationArn],
        cidrs: typeof cidrs === "string" ? [cidrs] : cidrs,
      });
    });
  }
}
