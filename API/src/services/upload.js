// feathers-blob service
const blobService = require("feathers-blob");
const fsBlob = require("fs-blob-store");
const blobStorage = fsBlob("/uploads");
const multipartMiddleware = require("multer")();
const { protect } = require("@feathersjs/authentication-local").hooks;
const Err = require("@feathersjs/errors");
const fs = require("fs");
const unzipper = require("unzipper");
const { getJSONInfo } = require("../modules/expo/asset");
const { getUpdateId } = require("../modules/expo/helpers");
const { logger } = require("../modules");

const createDocument = async (context) => {
  if (!context.result.id || !context.result.size) {
    throw new Err.GeneralError("Upload failed");
  }

  const upload = await context.app.service("uploads")._create({
    createdAt: new Date(),
    originalname: context.params.file.originalname,
    filename: `/uploads/${context.result.id}`,
    size: context.result.size,
    project: context.params.headers.project,
    version: context.params.headers.version,
    releaseChannel: context.params.headers["release-channel"],
    gitBranch: context.params.headers["git-branch"] || "Unknown",
    gitCommit: context.params.headers["git-commit"] || "Unknown",
    status: "ready",
  });

  const path = `/updates/${upload.project}`;
  fs.rmSync(path, { recursive: true, force: true });
  fs.mkdirSync(path, { recursive: true });

  try {
    const directory = await unzipper.Open.file(upload.filename);

    await directory.extract({ path });

    let appJson = null;
    let dependencies = null;
    let updateId = null;

    const newPath = path + "/" + upload.version;

    const info = getJSONInfo({ path: newPath });
    appJson = info.appJson;
    dependencies = info.dependencies;
    updateId = getUpdateId(newPath);

    await context.app
      .service("uploads")
      ._patch(upload._id, { path: newPath, appJson, dependencies, updateId });

    delete context.result.id;
    delete context.result.contentType;
    delete context.result.size;
    context.result.uploadId = upload._id;
    context.result.project = upload.project;
    context.result.releaseChannel = upload.releaseChannel;
    context.result.message =
      "Upload successful, use the web UI to release id: " + upload._id;

    context.app
      .service("messages")
      .create({ action: "update", keys: "uploads" });
    return context;
  } catch (e) {
    console.log("🚀 ~ createDocument ~ e:", e);
  }
};

const prepareForUpload = async (context) => {
  if (!context.params.headers["release-channel"]) {
    throw new Err.BadRequest("Upload failed: missing release-channel header");
  }

  if (context.app.get("uploadKey") !== context.params.headers["upload-key"]) {
    throw new Err.BadRequest(
      "Upload failed: missing or wrong upload-key header"
    );
  }

  // Handle multipart content
  if (!context.data.uri && context.params.file) {
    if (context.params.file.originalname.endsWith(".zip")) {
      context.params.file.mimetype = "application/zip";
    }
    const file = context.params.file;
    const uri = require("dauria").getBase64DataURI(file.buffer, file.mimetype);
    context.data = { uri };
  }
  return context;
};

const getHooks = () => ({
  before: {
    all: [],
    find: [],
    get: [],
    create: [prepareForUpload],
    update: [],
    patch: [],
    remove: [],
  },
  after: {
    all: [],
    find: [],
    get: [],
    create: [protect("uri"), createDocument],
    update: [],
    patch: [],
    remove: [],
  },
});

module.exports = (app) => {
  const blob = blobService({ Model: blobStorage });
  const middleware = (req, res, next) => {
    req.feathers.file = req.file;
    next();
  };

  app.use("/upload", multipartMiddleware.single("uri"), middleware, blob);
  app.service("upload").hooks(getHooks());
};
