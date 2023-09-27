import { organizationDetails } from "@config/coreConfig";
import { requiredTags } from "@config/taggingConfig";
import { getAccountFromShortName } from "@helpers/accounts";
import { TagEnforcementProps } from "@lib/types";
import { aws_organizations as organizations, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface TagPolicyProps extends StackProps {
  /**
   * Required tags and their allowed values
   */
  requiredTags: typeof requiredTags;
  /**
   * Enforcement and assignment
   */
  tagEnforcement: TagEnforcementProps;
}

export class TagPolicies extends Stack {
  constructor(scope: Construct, id: string, props: TagPolicyProps) {
    super(scope, id, props);

    const tags: Record<string, any> = {};
    Object.entries(props.requiredTags).forEach(([key, value]) => {
      const tagBase = {
        tag_key: {
          "@@assign": key,
        },
        tag_value: {
          "@@assign": value,
        },
      };

      const { enabled, enforcedResources } = props.tagEnforcement;
      if (enabled) {
        // append 'enforced_for' to the tag object
        tags[key] = {
          ...tagBase,
          // https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_supported-resources-enforcement.html
          enforced_for: {
            "@@assign": enforcedResources,
          },
        };
      } else {
        tags[key] = tagBase;
      }
    });

    const { targets } = props.tagEnforcement;

    const targetIds: string[] = [];

    // Attach the policy to the root of the organization
    if (targets.applyToEntireOrganization) {
      targetIds.push(organizationDetails.organizationRootId);
    } else {
      // Individual accounts
      if (targets.accounts) {
        targets.accounts.forEach((account) => {
          targetIds.push(getAccountFromShortName(account).id);
        });
      }

      // Organizational units
      if (targets.ous) {
        targets.ous.forEach((ou) => {
          targetIds.push(ou);
        });
      }
    }

    new organizations.CfnPolicy(this, "tagPolicy1", {
      name: "primary",
      description: "primary tag policy",
      content: {
        tags,
      },
      targetIds,
      type: "TAG_POLICY",
    });
  }
}
