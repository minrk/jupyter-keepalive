import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import { ICommandPalette } from "@jupyterlab/apputils";

import { URLExt } from "@jupyterlab/coreutils";

import { ServerConnection } from "@jupyterlab/services";

/**
 * Call the API extension
 *
 * @param endPoint API REST end point for the extension
 * @param init Initial values for the request
 * @returns The response body interpreted as JSON
 */
async function keepAliveRequest(endPoint = "", init = {}) {
  // Make request to Jupyter API
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(settings.baseUrl, "ext-keepalive", endPoint);

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message);
  }

  return data;
}

async function keepAliveStart() {
  return await keepAliveRequest("", { method: "POST" });
}

async function keepAliveStop() {
  return await keepAliveRequest("", { method: "DELETE" });
}

async function keepAliveRemaining() {
  return await keepAliveRequest("");
}

/**
 * Initialization data for the server-extension-example extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: "jupyter-keepalive",
  autoStart: true,
  optional: [],
  requires: [ICommandPalette],
  activate: async (app: JupyterFrontEnd, palette: ICommandPalette) => {
    console.log("JupyterLab extension keepalive is activated!");

    // GET request
    try {
      const data = await keepAliveRemaining();
      console.log(data);
    } catch (reason) {
      console.error(`Error on GET /api/.\n${reason}`);
    }

    // POST request
    const dataToSend = { name: "George" };
    try {
      const reply = await keepAliveStart();
      console.log(reply);
    } catch (reason) {
      console.error(
        `Error on POST /jlab-ext-example/hello ${dataToSend}.\n${reason}`,
      );
    }

    const { commands } = app;
    const category = "Keepalive";

    commands.addCommand("keepalive:start", {
      label: "Keep server alive while idle",
      caption:
        "Registers activity so idle cullers don't shut this server down.",
      execute: () => {
        // todo: prompt for interval
        // send as JSON.stringify({seconds: n})
        // maybe that should be minutes? who keeps alive for seconds...?
        keepAliveStart();
      },
    });

    commands.addCommand("keepalive:stop", {
      label: "Stop keeping server alive",
      caption: "Stop the keepalive spinner",
      execute: () => {
        keepAliveStop();
      },
    });

    commands.addCommand("keepalive:check", {
      label: "Check keepalive status",
      caption: "Check the remaining time on the ",
      execute: () => {
        keepAliveRemaining();
        // todo: display it somehow
      },
    });

    for (var command of [
      "keepalive:start",
      "keepalive:stop",
      "keepalive:check",
    ]) {
      palette.addItem({ command: command, category: category });
    }
  },
};

export default extension;
