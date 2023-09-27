import {
  GuardDutyClient,
  UpdateOrganizationConfigurationCommand,
  UpdateDetectorCommand,
  UpdateMalwareScanSettingsCommand,
  UpdateMalwareScanSettingsCommandInput,
  UpdateOrganizationConfigurationCommandInput,
  UpdateMemberDetectorsCommandInput,
  UpdateMemberDetectorsCommand,
  ListMembersCommand,
} from "@aws-sdk/client-guardduty";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { GuarddutyOrganizationConfigurationProps } from "@customResources/guarddutyOrganizationAutoEnable";
import { GuardDutyProtection } from "@lib/types";

const client = new GuardDutyClient({});

type InputProps = CloudFormationCustomResourceEvent & { ResourceProperties: GuarddutyOrganizationConfigurationProps };

async function updateOrganizationConfiguration(detectorId: string, protection: GuardDutyProtection) {
  const params: UpdateOrganizationConfigurationCommandInput = {
    AutoEnable: true,
    DetectorId: detectorId,
    DataSources: {
      S3Logs: {
        AutoEnable: protection.enableS3LogDataSources,
      },
      Kubernetes: {
        AuditLogs: {
          AutoEnable: protection.enableKubernetesAuditLogs,
        },
      },
    },
  };

  if (protection.malwareScanning?.enabled) {
    params.DataSources!.MalwareProtection = {
      ScanEc2InstanceWithFindings: {
        EbsVolumes: {
          AutoEnable: protection.malwareScanning?.enabled,
        },
      },
    };
  }
  const command = new UpdateOrganizationConfigurationCommand(params);
  await client.send(command);
}

async function updateDetectorMalwareSettings(
  detectorId: string,
  malwareScanning: GuardDutyProtection["malwareScanning"]
) {
  const malwareSettingsCommandInput: UpdateMalwareScanSettingsCommandInput = {
    DetectorId: detectorId,
    EbsSnapshotPreservation: malwareScanning?.retainDetectedSnapshots,
    ScanResourceCriteria: {},
  };

  // Malware Inclusion Tags
  if (malwareScanning?.inclusionTags) {
    malwareSettingsCommandInput.ScanResourceCriteria!.Include = {
      EC2_INSTANCE_TAG: {
        MapEquals: malwareScanning.inclusionTags,
      },
    };
  }

  // Malware Exclusion Tags
  if (malwareScanning?.exclusionTags) {
    malwareSettingsCommandInput.ScanResourceCriteria!.Exclude = {
      EC2_INSTANCE_TAG: {
        MapEquals: malwareScanning.exclusionTags,
      },
    };
  }

  const updateMalwareScanSettingsCommand = new UpdateMalwareScanSettingsCommand(malwareSettingsCommandInput);
  await client.send(updateMalwareScanSettingsCommand);
}

async function updateLocalAccountDetectorSettings(
  detectorId: string,
  findingPublishingFrequency: GuarddutyOrganizationConfigurationProps["findingPublishingFrequency"],
  protection: GuardDutyProtection
) {
  const updateDetectorCommand = new UpdateDetectorCommand({
    DetectorId: detectorId,
    // Organization defaults to 6 hours.  We want this to be flexible.
    FindingPublishingFrequency: findingPublishingFrequency,
    DataSources: {
      S3Logs: {
        Enable: protection.enableS3LogDataSources,
      },
      MalwareProtection: {
        ScanEc2InstanceWithFindings: {
          EbsVolumes: protection.malwareScanning?.enabled,
        },
      },
      Kubernetes: {
        AuditLogs: {
          Enable: protection.enableKubernetesAuditLogs,
        },
      },
    },
  });
  await client.send(updateDetectorCommand);
}

async function getMemberAccountIds(detectorId: string) {
  const command = new ListMembersCommand({
    DetectorId: detectorId,
  });
  const response = await client.send(command);
  const members: string[] = [];
  response.Members?.forEach((member) => members.push(member.AccountId!));
  return members;
}

// Spoke detectors must be updated when settings are toggled at the Organization-level
async function updateMemberDetectors(detectorid: string, accountIds: string[], protection: GuardDutyProtection) {
  const params: UpdateMemberDetectorsCommandInput = {
    AccountIds: accountIds,
    DetectorId: detectorid,
    DataSources: {
      S3Logs: {
        Enable: protection.enableS3LogDataSources,
      },
      Kubernetes: {
        AuditLogs: {
          Enable: protection.enableKubernetesAuditLogs,
        },
      },
    },
  };
  if (protection.malwareScanning?.enabled) {
    params.DataSources!.MalwareProtection = {
      ScanEc2InstanceWithFindings: {
        EbsVolumes: protection.malwareScanning?.enabled,
      },
    };
  }
  const command = new UpdateMemberDetectorsCommand(params);
  await client.send(command);
}

export async function handler(event: InputProps, context: Context): Promise<string> {
  console.log("event: ", event);

  const { detectorId, protection, findingPublishingFrequency } = event.ResourceProperties;

  try {
    await updateOrganizationConfiguration(detectorId, protection);
    await updateDetectorMalwareSettings(detectorId, protection.malwareScanning);
    await updateLocalAccountDetectorSettings(detectorId, findingPublishingFrequency, protection);

    const memberAccountIds = await getMemberAccountIds(detectorId);
    await updateMemberDetectors(detectorId, memberAccountIds, protection);
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
