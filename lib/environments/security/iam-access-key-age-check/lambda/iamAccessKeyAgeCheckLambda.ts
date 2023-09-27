import { Context } from "aws-lambda";
import { assumeRole, daysSince, getAccountId, listUserAccessKeys, listUsers } from "./helpers";
import { ClientCredentials, TargetAccountDetail, UsersInViolation } from "./types";

export async function handler(event: Pick<TargetAccountDetail, "name" | "id">, context: Context) {
  console.log("event: ", JSON.stringify(event, null, 2));

  // Check for required env vars
  const requiredEnvironmentVariables = ["MIN_NOTIFICATION_AGE", "TARGET_ROLE_NAME"];
  requiredEnvironmentVariables.forEach((envVar) => {
    if (!process.env[envVar]) throw new Error(`Environment variable ${envVar} must be set.`);
  });

  const result: TargetAccountDetail = {
    id: event.id,
    name: event.name,
  };
  const usersInViolation: UsersInViolation = {};
  const minimumReportingKeyAge = Number(process.env.MIN_NOTIFICATION_AGE);
  let credentials: ClientCredentials | undefined;

  try {
    // Determine if we're operating in the local account or we should assumeRole into a spoke
    const accountId = await getAccountId();
    if (event.id !== accountId) {
      credentials = await assumeRole(event.id, process.env.TARGET_ROLE_NAME!, "lambda-iam-access-key-age-check");
    }

    const users = await listUsers(credentials);

    if (!users) {
      console.log(`No IAM users found in ${event.name} (${event.id}).`);
    } else {
      await Promise.all(
        users.map(async (user) => {
          const { UserName: userName } = user;
          const accessKeys = await listUserAccessKeys(userName!, credentials);

          // Evaluate the age of each key for each user and record it if in violation
          accessKeys?.forEach((key) => {
            const age = daysSince(key.CreateDate!);

            if (age >= minimumReportingKeyAge) {
              if (usersInViolation[userName!]) {
                usersInViolation[userName!].push(age);
              } else {
                usersInViolation[userName!] = [age];
              }
            }
          });
        })
      );
    }
  } catch (error: unknown) {
    console.error(error);
    if (error instanceof Error) {
      return {
        id: event.id,
        name: event.name,
        error: error.message,
      };
    }
  }

  // If there are any users in violation, add them to the result
  if (Object.keys(usersInViolation).length > 0) {
    result.users = usersInViolation;
  }

  return result;
}
