import { Stack, StackProps, aws_organizations as organizations } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as scps from "./service-control-policies";
import { validRegion } from "@lib/types";

/**
 * Base interface for all SCP interfaces
 */
interface ScpBase {
  /**
   * List of Organizational targets
   *
   * This can be any combination of organization root (r-1234), an Organizational Unit (ou-1234-xxxxxxxxx),
   * or an AWS account ID.
   *
   * @example Assign to a single account and an Organizational Unit
   * ['123412341234', 'ou-1234-xxxxxxxxx']
   * @example Assign to the entire Organization
   *  ['r-1234']
   */
  targetIds: string[];
}

interface ScpRegionRestrict extends ScpBase {
  /**
   * List of AWS regions users *can* use
   *
   * @example ['us-east-1', 'us-west-2']
   */
  regions: validRegion[];
}

interface ScpPreventS3Removals extends ScpBase {
  /**
   * An object with the bucket name as a key and an array of paths for object values
   *
   * @example Protect a single bucket and path
   * {
   *   "exampleBucketName": ["/path/to/protected/resources/*"],
   * }
   * @example Protect all objects in multiple buckets
   * {
   *   "exampleBucketNameOne": ["/*"],
   *   "exampleBucketNameTwo": ["/*"],
   * }
   */
  bucketsDetails: Record<string, string[]>;
}

interface ScpPreventAwsConfigDisable extends ScpBase {}
interface ScpPreventCloudTrailDisable extends ScpBase {}
interface ScpPreventGuardDutyDisable extends ScpBase {}
interface ScpPreventRootAccountUsage extends ScpBase {}
interface ScpPreventOrganizationExit extends ScpBase {}
interface ScpPreventPasswordPolicyChanges extends ScpBase {}

export interface ServiceControlPoliciesProps extends StackProps {
  /**
   * Restrict non-global services to specific regions
   */
  restrictToRegions: ScpRegionRestrict;
  /**
   * Prevent disabling AWS Config
   */
  preventDisablingAwsConfig?: ScpPreventAwsConfigDisable;
  /**
   * Prevent disabling CloudTrail
   */
  preventDisablingCloudTrail?: ScpPreventCloudTrailDisable;
  /**
   * Prevent disabling Guardduty
   */
  preventDisablingGuardduty?: ScpPreventGuardDutyDisable;
  /**
   * Prevent from leaving the AWS Organization
   */
  preventOrganizationExit?: ScpPreventOrganizationExit;
  /**
   * Prevent the IAM password policy from being removed or updated
   */
  preventPasswordPolicyChanges?: ScpPreventPasswordPolicyChanges;
  /**
   * Prevent usage of the AWS root account
   */
  preventRootAccountUsage?: ScpPreventRootAccountUsage;
  /**
   * Prevent the removal of S3 buckets and their objects, including object versions
   */
  preventS3Removals?: ScpPreventS3Removals;
}

export class ServiceControlPolicies extends Stack {
  constructor(scope: Construct, id: string, props: ServiceControlPoliciesProps) {
    super(scope, id, props);

    // Restrict AWS usages for non-global services to specific regions
    if (props.restrictToRegions) {
      new organizations.CfnPolicy(this, "regionRestrict", {
        content: scps.regionRestrict(props.restrictToRegions.regions),
        name: "region-restrict",
        type: "SERVICE_CONTROL_POLICY",
        description: "restrict use of non-global services to specific regions",
        targetIds: props.restrictToRegions.targetIds,
      });
    }

    if (props.preventDisablingAwsConfig) {
      new organizations.CfnPolicy(this, "preventDisablingConfig", {
        content: scps.preventDisablingConfig(),
        name: "prevent-disabling-config",
        type: "SERVICE_CONTROL_POLICY",
        description: "Prevent disabling AWS Config",
        targetIds: props.preventDisablingAwsConfig.targetIds,
      });
    }

    if (props.preventDisablingCloudTrail) {
      new organizations.CfnPolicy(this, "preventDisablingCloudTrail", {
        content: scps.preventDisablingCloudTrail(),
        name: "prevent-disabling-cloudtrail",
        type: "SERVICE_CONTROL_POLICY",
        description: "Prevent disabling CloudTrail",
        targetIds: props.preventDisablingCloudTrail.targetIds,
      });
    }

    if (props.preventDisablingGuardduty) {
      new organizations.CfnPolicy(this, "preventDisablingGuardduty", {
        content: scps.preventDisablingGuardDuty(),
        name: "prevent-disabling-guardduty",
        type: "SERVICE_CONTROL_POLICY",
        description: "Prevent disabling GuardDuty",
        targetIds: props.preventDisablingGuardduty.targetIds,
      });
    }

    if (props.preventPasswordPolicyChanges) {
      new organizations.CfnPolicy(this, "preventPasswordPolicyChanges", {
        content: scps.preventPasswordPolicyChanges(),
        name: "prevent-password-policy-changes",
        type: "SERVICE_CONTROL_POLICY",
        description: "prevent IAM password policy changes",
        targetIds: props.preventPasswordPolicyChanges.targetIds,
      });
    }

    if (props.preventS3Removals) {
      new organizations.CfnPolicy(this, "preventS3objectRemoval", {
        content: scps.preventS3Removals(props.preventS3Removals.bucketsDetails),
        name: "prevent-s3-removals",
        type: "SERVICE_CONTROL_POLICY",
        description: "prevents object and bucket removal from the specificed buckets and paths",
        targetIds: props.preventS3Removals.targetIds,
      });
    }

    if (props.preventRootAccountUsage) {
      new organizations.CfnPolicy(this, "preventRootAccountUsage", {
        content: scps.preventRootAccountUsage(),
        name: "prevent-root-account-usage",
        type: "SERVICE_CONTROL_POLICY",
        description: "prevents the use of the AWS root account",
        targetIds: props.preventRootAccountUsage.targetIds,
      });
    }
  }
}
