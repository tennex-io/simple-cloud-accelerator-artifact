import { BackupClient, UpdateRegionSettingsCommand, UpdateRegionSettingsCommandOutput } from "@aws-sdk/client-backup";
import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import * as esbuild from "esbuild";
import * as path from "path";

import { handler } from "../backupEnableRegionalServicesLambda";
import { inputEventCreateBase, mockMetadata } from "./types";

const mockUpdateRegionSettingsResponse: UpdateRegionSettingsCommandOutput = {
  ...mockMetadata,
};

const inputEvent = inputEventCreateBase;
inputEvent.ResourceProperties.services = {
  S3: true,
  EFS: false,
};

const backupMock = mockClient(BackupClient);

describe("Backup Enable Regional Services Lambda", () => {
  beforeEach(() => {
    backupMock.reset();
  });

  it("Bundles without errors", async () => {
    const codepath = path.join(__dirname, "../backupEnableRegionalServicesLambda.ts");

    await esbuild.build({
      entryPoints: [codepath],
      external: ["aws-sdk"],
      platform: "node",
      bundle: true,
      write: false,
    });
  });

  it("handler function is async", async () => {
    const task = handler(inputEvent, {} as Context);
    expect(task).toBeInstanceOf(Promise);
  });

  it("Executes successfully with parameters set", async () => {
    backupMock.on(UpdateRegionSettingsCommand).resolves(mockUpdateRegionSettingsResponse);
    const response = await handler(inputEvent, {} as Context);
    expect(response).toBe("success");
  });

  it("Logs an error if the handler throws an error", async () => {
    const consoleSpy = jest.spyOn(console, "error");
    backupMock.on(UpdateRegionSettingsCommand).rejects(new Error("Test Error"));
    await handler(inputEvent, {} as Context);
    expect(consoleSpy).toHaveBeenCalledWith("Test Error");
  });
});
