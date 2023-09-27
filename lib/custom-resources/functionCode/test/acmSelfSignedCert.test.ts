import { ACMClient, ImportCertificateCommand, ImportCertificateCommandOutput } from "@aws-sdk/client-acm";
import { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import * as esbuild from "esbuild";
import * as path from "path";

import { handler } from "../acmSelfSignedCert";
import { inputEventCreateBase, mockMetadata } from "./types";

const inputEvent = inputEventCreateBase;
const certificateArn = "arn:aws:acm:us-east-1:999999999999:certificate/99999999-9999-9999-9999-999999999999";
const mockImportCertificateResponse: ImportCertificateCommandOutput = {
  ...mockMetadata,
  CertificateArn: certificateArn,
};

const acmMock = mockClient(ACMClient);

describe("ACM Self Signed Certificate", () => {
  beforeEach(() => {
    acmMock.reset();
  });

  it("Bundles without errors", async () => {
    const codepath = path.join(__dirname, "../acmSelfSignedCert.ts");

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

  it("Execution returns the proper object", async () => {
    acmMock.on(ImportCertificateCommand).resolves(mockImportCertificateResponse);
    const response = await handler(inputEvent, {} as Context);
    expect(response).toStrictEqual({
      Data: {
        certificateArn,
      },
    });
  });

  it("Logs an error if the handler throws an error", async () => {
    acmMock.on(ImportCertificateCommand).rejects(new Error("Test Error"));
    const consoleSpy = jest.spyOn(console, "error");
    await handler(inputEvent, {} as Context);
    expect(consoleSpy).toHaveBeenCalledWith("Test Error");
  });
});
