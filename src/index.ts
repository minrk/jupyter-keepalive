import { Signal } from "@lumino/signaling";
import { Widget } from "@lumino/widgets";

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import { Dialog, showDialog, ICommandPalette } from "@jupyterlab/apputils";
import { IStatusBar } from "@jupyterlab/statusbar";

import { URLExt } from "@jupyterlab/coreutils";

import { ServerConnection } from "@jupyterlab/services";

// import "./index.css";

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
  } catch (error: any) {
    throw new ServerConnection.NetworkError(error);
  }
  const responseJSON = await response.text();
  if (responseJSON.length == 0) {
    return;
  }
  const data = JSON.parse(responseJSON);

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message);
  }

  return data;
}

const DAY_SECONDS: number = 24 * 60 * 60;

const hmsPattern =
  /^(?:(?<days>\d+):(?=\d+:))?(?:(?<hours>\d+):)?(?<seconds>\d+)$/;
const abbrevPattern =
  /^(?:(?<days>\d+)d)?(?:(?<hours>\d+)h)?(?:(?<minutes>\d+)m)?(?:(?<seconds>\d+)s?)?$/;

const multipliers = {
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60,
  seconds: 1,
};

function parseTime(ts: string): number {
  let seconds: number = 0;
  let match = hmsPattern.exec(ts);
  if (!match) {
    match = abbrevPattern.exec(ts);
  }
  if (!match) {
    throw Error(
      `time string '${ts}' as a time. Expected e.g. '1:30' or '120m'`,
    );
  }

  let part: keyof typeof multipliers;
  for (part in multipliers) {
    if (match.groups[part] !== undefined) {
      seconds += multipliers[part] * parseInt(match.groups[part]);
    }
  }
  return seconds;
}

function formatSeconds(seconds: number): string {
  console.log("formatting", seconds);
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 120) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s}s`;
  } else if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m}m`;
  } else {
    const h = Math.round(seconds / 3600);
    return `${h}h`;
  }
}

class KeepAliveExtension {
  remainingSignal: Signal<KeepAliveExtension, number>;
  remaining: number;

  constructor() {
    this.remainingSignal = new Signal<this, number>(this);
    this.remainingSignal.connect(this.scheduleUpdate);
    this.remaining = 0;
  }

  scheduleUpdate(sender: KeepAliveExtension, remaining: number) {
    // keep widgets updated at an appropriate in
    sender.remaining = remaining;
    if (!remaining) {
      return;
    }
    let timeout: number = 0;
    if (remaining < 60) {
      timeout = 1;
    } else if (remaining < 120) {
      // every 2 seconds if we're within 2 minutes
      timeout = 2;
    } else if (remaining < 60) {
      // every minute if we're within an hour
      timeout = 60;
    } else {
      // at least every 5 minutes
      timeout = 300;
    }
    setTimeout(() => {
      sender.getRemaining();
    }, timeout * 1000);
  }

  setupStatusBar(statusBar: IStatusBar) {
    const keepAliveStatusWidget = new Widget();
    this.remainingSignal.connect(
      (sender: KeepAliveExtension, remaining: number) => {
        if (remaining) {
          const remaining_text = formatSeconds(remaining);
          keepAliveStatusWidget.node.textContent = "";
          const span = document.createElement("span");
          span.textContent = `keepalive: ${remaining_text}`;
          // TODO: import css?
          // css is copied from TextItem, but using TextItem is incredibly complicated apparently
          span.style.cssText =
            "line-height: 24px; color: var(--jp-ui-font-color1); font-family: var(--jp-ui-font-family); font-size: var(--jp-ui-font-size1);";

          keepAliveStatusWidget.node.title = `Jupyter Server will not appear idle idle for ${remaining_text}`;
          keepAliveStatusWidget.node.appendChild(span);
        } else {
          // any info for 'not' alive?
          keepAliveStatusWidget.node.textContent = "";
        }
      },
    );

    statusBar.registerStatusItem("keepalive", {
      align: "left",
      item: keepAliveStatusWidget,
      isActive: () => this.remaining > 0,
    });
  }

  async start(seconds: number = DAY_SECONDS): Promise<void> {
    const keepAliveData = await keepAliveRequest("", {
      method: "POST",
      body: JSON.stringify({ seconds: seconds }),
    });
    this.remainingSignal.emit(keepAliveData.remaining);
  }

  async stop(): Promise<void> {
    await keepAliveRequest("", { method: "DELETE" });
    this.remainingSignal.emit(0);
  }

  async getRemaining(): Promise<number> {
    const keepAliveData = await keepAliveRequest("");
    this.remainingSignal.emit(keepAliveData.remaining);
    return keepAliveData.remaining;
  }

  async startDialog(): Promise<void> {
    const result = await showDialog({
      title: "Keep Jupyter server alive",
      body: new KeepAliveDialogBody(),
      focusNodeSelector: "input",
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: "Keep alive" }),
      ],
    });
    if (!result.value) {
      return;
    }
    const t = parseTime(result.value);
    await this.start(t);
  }
}

class KeepAliveDialogBody extends Widget {
  /**
   * Construct a new keep alive dialog.
   */
  constructor() {
    const body = document.createElement("div");
    const description = document.createElement("p");
    description.textContent =
      "Keep Jupyter Server from shutting down due to idle culling for a period of time. \
      Use abbreviated notation such as '2d' for two days, \
      '3h45m' for 3 hours and 45 minutes, \
      or seconds as an integer (900).";

    const label = document.createElement("label");
    label.textContent = "Duration";
    const input = document.createElement("input");
    input.placeholder = "24h";
    input.value = "24h";
    body.appendChild(description);
    body.appendChild(label);
    body.appendChild(input);
    super({ node: body });
  }

  /**
   * Get the input text node.
   */
  get inputNode(): HTMLInputElement {
    return this.node.getElementsByTagName("input")[0] as HTMLInputElement;
  }

  /**
   * Get the value of the widget.
   */
  getValue(): string {
    return this.inputNode.value;
  }
}

/**
 * Initialization data for the extension.
 */

const extension: JupyterFrontEndPlugin<KeepAliveExtension> = {
  id: "jupyter-keepalive",
  autoStart: true,
  optional: [IStatusBar],
  requires: [ICommandPalette],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    statusBar: IStatusBar,
  ) => {
    console.log("JupyterLab extension keepalive is activated!");

    const keepAlive = new KeepAliveExtension();
    if (statusBar) {
      keepAlive.setupStatusBar(statusBar);
    }

    const { commands } = app;
    const category = "Keepalive";

    commands.addCommand("keepalive:start", {
      label: "Keep server alive while idle (24h)",
      caption:
        "Registers activity so idle cullers don't shut this server down, for `seconds`.",
      execute: (args) => {
        let seconds: number;
        if (typeof args.seconds === "number") {
          seconds = args.seconds;
        } else if (typeof args.seconds === "string") {
          seconds = parseTime(args.seconds);
        } else {
          seconds = DAY_SECONDS;
        }
        keepAlive.start(seconds);
      },
    });

    commands.addCommand("keepalive:start-dialog", {
      label: "Keep server alive while idle (dialog)",
      caption:
        "Registers activity so idle cullers don't shut this server down.",
      execute: () => {
        keepAlive.startDialog();
      },
    });

    commands.addCommand("keepalive:stop", {
      label: "Stop keeping server alive",
      caption: "Stop the keepalive spinner",
      execute: () => {
        keepAlive.stop();
      },
    });

    commands.addCommand("keepalive:check", {
      label: "Check keepalive status",
      caption: "Check the remaining time on the keepalive timer",
      execute: () => {
        keepAlive.getRemaining();
        // todo: display it somehow
      },
    });

    for (const command of [
      "keepalive:start",
      "keepalive:start-dialog",
      "keepalive:stop",
      "keepalive:check",
    ]) {
      palette.addItem({ command: command, category: category });
    }

    await keepAlive.getRemaining();

    return keepAlive;
  },
};

export default extension;
