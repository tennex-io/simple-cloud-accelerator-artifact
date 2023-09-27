import { aws_ec2 as ec2, aws_ram as ram, CfnTag } from "aws-cdk-lib";
import { Construct } from "constructs";

interface SharedPrefixListProps {
  /**
   * Allow accounts outside the AWS Organization to access the share
   *
   * @default false
   */
  allowExternalPrincipals?: boolean;
  /**
   * List of CIDRs
   *
   * @example
   * ```
   * ['10.0.0.0/16']
   * ```
   */
  cidrs: string[];
  /**
   * Maximum number of entires in the prefix list
   *
   * @default 128
   */
  maxEntries?: number;
  /**
   * Prefix list name
   */
  prefixListName: string;
  /**
   * List of IAM principals to share the secret with
   */
  sharePrincipals: string[];
  /**
   * Optional tags applied to the prefix list and RAM share
   */
  tags?: CfnTag[];
}

export class SharedPrefixList extends Construct {
  public prefixList: ec2.CfnPrefixList;

  constructor(scope: Construct, id: string, props: SharedPrefixListProps) {
    super(scope, id);

    const maxEntries = props.maxEntries ?? 128;

    const prefixList = new ec2.CfnPrefixList(this, "prefixList", {
      addressFamily: "IPv4",
      entries: props.cidrs.map((cidr) => {
        return { cidr };
      }),
      maxEntries,
      prefixListName: props.prefixListName,
      tags: props.tags,
    });

    new ram.CfnResourceShare(this, "prefixListShare", {
      name: props.prefixListName,
      principals: props.sharePrincipals,
      allowExternalPrincipals: props.allowExternalPrincipals ?? false,
      resourceArns: [prefixList.attrArn],
      tags: props.tags,
    });
  }
}
