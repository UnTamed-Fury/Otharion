import { defineRailway, github, preserve, project, service } from "railway/iac";

export const partial = "otharion";

export default defineRailway((ctx) => {
  const isTest = ctx?.isEnvironment?.("test") || ctx?.environment === "test";

  const otharion = service("otharion", {
    source: github("UnTamed-Fury/Otharion"),
    build: {
      builder: "NIXPACKS",
      buildCommand: "pnpm build",
      watchPatterns: isTest
        ? ["src/**", "tests/**", "package.json", "pnpm-lock.yaml", "tsconfig.json"]
        : ["src/**", "package.json", "pnpm-lock.yaml", "tsconfig.json"],
    },
    deploy: {
      startCommand: isTest ? "pnpm test" : "pnpm start",
      restartPolicyType: isTest ? "NEVER" : "ON_FAILURE",
      restartPolicyMaxRetries: isTest ? 0 : 10,
      sleepApplication: !isTest,
    },
    variables: {
      OTHARION_DISCORD_TOKEN: preserve(),
      OTHARION_FLUXER_TOKEN: preserve(),
      PREFIX: preserve(),
      DATA_DIR: preserve(),
      OWNER_ID: preserve(),
    },
  });

  return project("Fury", {
    resources: [otharion],
  });
});
