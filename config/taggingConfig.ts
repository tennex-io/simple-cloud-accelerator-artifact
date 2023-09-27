import { MinimumRequiredTags, TagEnforcementProps } from "@lib/types";

// Define up to ** 6 ** tags with allowed values
export const requiredTags = {
  Department: ["Finance", "Infrastructure", "Research", "Security"],
  Owner: ["Finance", "Infrastructure", "Research", "Security"],
  Program: ["Finance", "Infrastructure", "Research", "Security"],
} as const;

// Organization Tag Policy Enforcement
export const tagEnforcement: TagEnforcementProps = {
  enabled: true,
  enforcedResources: ["ec2:instance", "ec2:volume", "s3:bucket"],
  targets: {
    applyToEntireOrganization: true,
  },
};

// Tags applied to specific S3 buckets in this solution
export const bucketTags: Record<string, MinimumRequiredTags> = {
  awsConfig: {
    Department: "Security",
    Owner: "Security",
    Program: "Security",
  },
  cdkBootstrap: {
    Department: "Infrastructure",
    Owner: "Infrastructure",
    Program: "Infrastructure",
  },
  cloudTrail: {
    Department: "Security",
    Owner: "Security",
    Program: "Security",
  },
  costAndUsage: {
    Department: "Finance",
    Owner: "Finance",
    Program: "Finance",
  },
  storageLens: {
    Department: "Infrastructure",
    Owner: "Infrastructure",
    Program: "Infrastructure",
  },
};
