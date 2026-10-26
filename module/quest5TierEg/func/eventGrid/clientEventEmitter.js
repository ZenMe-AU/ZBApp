/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

const EventEmitter = require("events");

class clientEventEmitter {
  rawClient = null;
  credential = null;
  type = "eventEmitter";
  endpoint = null;
  topic = null;
  funcMetaData = null;

  constructor({ endpoint }) {
    if (!endpoint) {
      throw new Error("Missing required field: endpoint");
    }
    this.endpoint = endpoint;
    this.rawClient = new EventEmitter();
    this.funcMetaData = null;
    console.log(`Created event grid emitter client for endpoint=${endpoint}`, this.rawClient);
  }

  getFuncMetaData() {
    if (!this.funcMetaData) {
      this.funcMetaData = require("../funcMetaData");
    }
    return this.funcMetaData;
  }

  sendEvents = (events) => {
    if (!events || !Array.isArray(events) || events.length === 0) {
      throw new Error("sendEvents requires a non-empty array of events");
    }
    const funcMetaData = this.getFuncMetaData();
    const matchingCommand = funcMetaData.commands.find((cmd) => events[0].type === cmd.subscriptionFilter);
    if (matchingCommand) {
      // this.rawClient.on(
      //   events[0].type,
      //   function (events) {
      //     fetch(this.endpoint + "/runtime/webhooks/EventGrid?functionName=" + matchingCommand.queueFuncName, {
      //       method: "POST",
      //       headers: {
      //         "aeg-event-type": "Notification",
      //         "Content-Type": "application/json",
      //       },
      //       body: JSON.stringify(events),
      //     })
      //       .then((response) => {
      //         if (!response.ok) {
      //           throw new Error(`Failed to send events to Webhook: ${response.statusText}`);
      //         }
      //         console.log(`Successfully sent events to Webhook`, events);
      //       })
      //       .catch((error) => {
      //         console.error(`Error sending events to Webhook:`, error);
      //       });
      //   }.bind(this)
      // );
      // this.rawClient.on(matchingCommand.eventQueueName, (events) => {
      //   console.log(`Emitted events to queue '${matchingCommand.eventQueueName}'`, events);
      // });
      return matchingCommand.queueHandler(events[0], {
        functionName: matchingCommand.queueFuncName,
        invocationId: events[0].id,
        triggerMetadata: {},
      });
    }
    console.log(`🛄 Preparing to emit events of type '${events[0].type}' to endpoint '${this.endpoint}'`);
    return this.rawClient.emit(events[0].type, events);
  };
}

module.exports = clientEventEmitter;
