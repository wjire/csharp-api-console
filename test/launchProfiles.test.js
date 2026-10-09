const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { after, test } = require("node:test");

const startedConfigurations = [];
const vscodeMock = {
  env: { language: "zh-cn" },
  debug: {
    startDebugging: async (_folder, configuration) => {
      startedConfigurations.push(configuration);
      return true;
    },
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  return request === "vscode"
    ? vscodeMock
    : originalLoad.call(this, request, parent, isMain);
};
const { LaunchSettingsReader } = require("../out/launchSettingsReader");
const { ApiConsolePanel } = require("../out/apiConsolePanel");
Module._load = originalLoad;

const fixtureDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "csharp-api-console-profiles-"),
);
const projectPath = path.join(fixtureDir, "Example.csproj");
const settingsPath = path.join(fixtureDir, "Properties", "launchSettings.json");
const profiles = {
  "Example.QueryAPI.1": {
    commandName: "Project",
    applicationUrl: "https://localhost:18078;http://localhost:18079",
    environmentVariables: { ASPNETCORE_ENVIRONMENT: "Development" },
  },
  "Example.QueryAPI.2": {
    commandName: "Project",
    applicationUrl: "http://0.0.0.0:18080",
    environmentVariables: { ASPNETCORE_ENVIRONMENT: "dev1" },
  },
  http: {
    commandName: "Project",
    applicationUrl: "http://localhost:18081",
    environmentVariables: { ASPNETCORE_ENVIRONMENT: "Development" },
  },
  "IIS Express": { commandName: "IISExpress" },
};
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(
  settingsPath,
  "\uFEFF// launch profiles\n" + JSON.stringify({ profiles }),
);
fs.writeFileSync(projectPath, "<Project />");
for (const framework of ["netcoreapp3.1", "net8.0", "net10.0"]) {
  const assemblyPath = path.join(
    fixtureDir,
    "bin",
    "Debug",
    framework,
    "Example.dll",
  );
  fs.mkdirSync(path.dirname(assemblyPath), { recursive: true });
  fs.writeFileSync(assemblyPath, "");
}
after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

function createPanel(targetFramework) {
  const panel = Object.create(ApiConsolePanel.prototype);
  const statuses = [];
  const builds = [];
  panel.currentProjectPath = projectPath;
  panel.isCurrentProjectDebugRunning = () => false;
  panel.getWorkspaceFolderForCurrentProject = () => undefined;
  panel.getTargetFrameworksFromProject = () =>
    targetFramework ? [targetFramework] : [];
  panel.buildProjectForCoreClr = async (project, framework) => {
    builds.push({ project, framework });
    return true;
  };
  panel.postDebugStatus = (status, message) =>
    statuses.push({ status, message });
  return { panel, statuses, builds };
}

test("lists Project profiles in file order, ignoring IISExpress and supporting BOM/comments", () => {
  assert.deepEqual(LaunchSettingsReader.getProjectProfileNames(projectPath), [
    "Example.QueryAPI.1",
    "Example.QueryAPI.2",
    "http",
  ]);
});

test("reads the selected environment and URL, preserving the first-profile default", () => {
  assert.equal(
    LaunchSettingsReader.getBaseUrl(projectPath),
    "http://localhost:18079",
  );
  assert.equal(
    LaunchSettingsReader.getBaseUrl(projectPath, "Example.QueryAPI.2"),
    "http://localhost:18080",
  );
  assert.deepEqual(
    LaunchSettingsReader.getEnvironmentVariables(
      projectPath,
      "Example.QueryAPI.2",
    ),
    {
      ASPNETCORE_ENVIRONMENT: "dev1",
    },
  );
  assert.equal(LaunchSettingsReader.getBaseUrl(projectPath, "missing"), null);
  assert.deepEqual(
    LaunchSettingsReader.getEnvironmentVariables(projectPath, "missing"),
    {},
  );
  assert.deepEqual(LaunchSettingsReader.getProjectProfileNames(undefined), []);
});

test("launches the selected modern .NET profile through documented coreclr settings", async () => {
  const { panel, builds } = createPanel("net8.0");
  await panel.handleMessage({
    type: "startDebug",
    data: { profileName: "Example.QueryAPI.2" },
  });
  const configuration = startedConfigurations.at(-1);
  assert.equal(configuration.type, "coreclr");
  assert.equal(configuration.launchConfigurationId, undefined);
  assert.equal(configuration.env.ASPNETCORE_ENVIRONMENT, "dev1");
  assert.equal(configuration.launchSettingsProfile, "Example.QueryAPI.2");
  assert.equal(configuration.launchSettingsFilePath, settingsPath);
  assert.equal(
    configuration.program,
    path.join(fixtureDir, "bin", "Debug", "net8.0", "Example.dll"),
  );
  assert.deepEqual(builds, [{ project: projectPath, framework: "net8.0" }]);
});

test("net10.0/http never sends the invalid synthetic Dev Kit configuration ID", async () => {
  const { panel, builds } = createPanel("net10.0");
  await panel.startDebugSession("http");
  const configuration = startedConfigurations.at(-1);
  assert.equal(configuration.type, "coreclr");
  assert.equal(configuration.launchSettingsProfile, "http");
  assert.equal(configuration.launchSettingsFilePath, settingsPath);
  assert.equal(configuration.launchConfigurationId, undefined);
  assert.equal(
    configuration.program,
    path.join(fixtureDir, "bin", "Debug", "net10.0", "Example.dll"),
  );
  assert.deepEqual(builds, [{ project: projectPath, framework: "net10.0" }]);
});

test("passes the selected profile and launchSettings path to the coreclr debugger", async () => {
  const { panel } = createPanel("netcoreapp3.1");
  await panel.startDebugSession("Example.QueryAPI.2");
  const configuration = startedConfigurations.at(-1);
  assert.equal(configuration.type, "coreclr");
  assert.equal(configuration.launchSettingsProfile, "Example.QueryAPI.2");
  assert.equal(configuration.launchSettingsFilePath, settingsPath);
  assert.equal(configuration.env.ASPNETCORE_ENVIRONMENT, "dev1");
  assert.equal(configuration.launchConfigurationId, undefined);
});

test("defaults to the first Project profile when no selection is supplied", async () => {
  const { panel } = createPanel("net8.0");
  await panel.startDebugSession();
  const configuration = startedConfigurations.at(-1);
  assert.equal(configuration.type, "coreclr");
  assert.equal(configuration.launchConfigurationId, undefined);
  assert.equal(configuration.launchSettingsProfile, "Example.QueryAPI.1");
  assert.equal(configuration.env.ASPNETCORE_ENVIRONMENT, "Development");
});

test("does not start a selected profile when the Debug build fails", async () => {
  const previousCount = startedConfigurations.length;
  const { panel, statuses } = createPanel("net10.0");
  panel.buildProjectForCoreClr = async () => false;
  await panel.startDebugSession("http");
  assert.equal(startedConfigurations.length, previousCount);
  assert.equal(statuses.at(-1).status, "error");
});

test("rejects selected-profile launch when the target framework is unknown", async () => {
  const previousCount = startedConfigurations.length;
  const { panel, statuses, builds } = createPanel(undefined);
  await panel.startDebugSession("http");
  assert.equal(startedConfigurations.length, previousCount);
  assert.equal(statuses.at(-1).status, "error");
  assert.deepEqual(builds, []);
});

test("does not launch when the built assembly cannot be found", async () => {
  const previousCount = startedConfigurations.length;
  const { panel, statuses } = createPanel("net9.0");
  await panel.startDebugSession("http");
  assert.equal(startedConfigurations.length, previousCount);
  assert.equal(statuses.at(-1).status, "error");
});

test("rejects a removed or unsupported profile instead of silently starting another", async () => {
  const previousCount = startedConfigurations.length;
  for (const name of ["missing", "IIS Express"]) {
    const { panel, statuses } = createPanel("net8.0");
    await panel.startDebugSession(name);
    assert.equal(statuses.at(-1).status, "error");
    assert.ok(statuses.at(-1).message.includes(name));
  }
  assert.equal(startedConfigurations.length, previousCount);
});

test("retains default debugging when launchSettings.json is unavailable", async () => {
  const { panel } = createPanel("net8.0");
  panel.currentProjectPath = path.join(
    fixtureDir,
    "NoSettings",
    "Example.csproj",
  );
  await panel.startDebugSession();
  const configuration = startedConfigurations.at(-1);
  assert.equal(configuration.type, "dotnet");
  assert.equal(configuration.launchConfigurationId, undefined);
  assert.deepEqual(configuration.env, {});
});
