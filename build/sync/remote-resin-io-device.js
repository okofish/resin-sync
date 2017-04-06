// Generated by CoffeeScript 1.12.4

/*
Copyright 2016 Resin.io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */

/**
 * @module resinSync
 */
var MIN_HOSTOS_RSYNC, Promise, SpinnerPromise, _, buildRsyncCommand, chalk, ensureHostOSCompatibility, infoContainerSpinner, ref, resin, semver, semverRegExp, settings, shell, startContainerAfterErrorSpinner, startContainerSpinner, stopContainerSpinner;

Promise = require('bluebird');

_ = require('lodash');

chalk = require('chalk');

semver = require('semver');

resin = require('resin-sdk-preconfigured');

settings = require('resin-settings-client');

shell = require('../shell');

SpinnerPromise = require('resin-cli-visuals').SpinnerPromise;

buildRsyncCommand = require('../rsync').buildRsyncCommand;

ref = require('../utils'), stopContainerSpinner = ref.stopContainerSpinner, startContainerSpinner = ref.startContainerSpinner, infoContainerSpinner = ref.infoContainerSpinner, startContainerAfterErrorSpinner = ref.startContainerAfterErrorSpinner;

MIN_HOSTOS_RSYNC = '1.1.4';

semverRegExp = /[0-9]+\.[0-9]+\.[0-9]+(?:(-|\+)[^\s]+)?/;


/**
 * @summary Ensure HostOS compatibility
 * @function
 * @private
 *
 * @description
 * Ensures 'rsync' is installed on the target device by checking
 * HostOS version. Fullfills promise if device is compatible or
 * rejects it otherwise. Version checks are based on semver.
 *
 * @param {String} osRelease - HostOS version as returned from the API (device.os_release field)
 * @param {String} minVersion - Minimum accepted HostOS version
 * @returns {Promise}
 *
 * @example
 * ensureHostOSCompatibility(device.os_version, MIN_HOSTOS_RSYNC)
 * .then ->
 *		console.log('Is compatible')
 * .catch ->
 *		console.log('Is incompatible')
 */

ensureHostOSCompatibility = Promise.method(function(osRelease, minVersion) {
  var ref1, version;
  version = osRelease != null ? (ref1 = osRelease.match(semverRegExp)) != null ? ref1[0] : void 0 : void 0;
  if (version == null) {
    throw new Error("Could not parse semantic version from HostOS release info: " + osRelease);
  }
  if (semver.lt(version, minVersion)) {
    throw new Error("Incompatible HostOS version: " + osRelease + " - must be >= " + minVersion);
  }
});

exports.ensureDeviceIsOnline = function(uuid) {
  return resin.models.device.get(uuid).then(function(device) {
    if (!device.is_online) {
      throw new Error("Device is offline: " + uuid);
    }
    return uuid;
  });
};


/**
 * @summary Sync your changes with a device
 * @function
 * @public
 *
 * @description
 * This module provides a way to sync changes from a local source
 * directory to a device. It relies on the following dependencies
 * being installed in the system:
 *
 * - `rsync`
 * - `ssh`
 *
 * You can save all the options mentioned below in a `resin-sync.yml`
 * file, by using the same option names as keys. For example:
 *
 * 	$ cat $PWD/resin-sync.yml
 * 	destination: '/usr/src/app/'
 * 	before: 'echo Hello'
 * 	after: 'echo Done'
 * 	port: 22
 * 	ignore:
 * 		- .git
 * 		- node_modules/
 *
 * Notice that explicitly passed command options override the ones
 * set in the configuration file.
 *
 * @param {Object} [syncOptions] - cli options
 * @param {String} [syncOptions.uuid] - device uuid
 * @param {String} [syncOptions.baseDir] - project base dir
 * @param {String} [syncOptions.destination=/usr/src/app] - destination directory on device
 * @param {String} [syncOptions.before] - command to execute before sync
 * @param {String} [syncOptions.after] - command to execute after sync
 * @param {String[]} [syncOptions.ignore] - ignore paths
 * @param {Number} [syncOptions.port=22] - ssh port
 * @param {Boolean} [syncOptions.skipGitignore=false] - skip .gitignore when parsing exclude/include files
 * @param {Boolean} [syncOptions.skipRestart=false] - do not restart container after sync
 * @param {Boolean} [syncOptions.progress=false] - display rsync progress
 * @param {Boolean} [syncOptions.verbose=false] - display verbose info
 *
 * @example
 * sync({
 *		uuid: '7a4e3dc',
 *		baseDir: '.',
 *		destination: '/usr/src/app',
 *   ignore: [ '.git', 'node_modules' ],
 *   progress: false
 * });
 */

exports.sync = function(arg) {
  var after, baseDir, before, destination, getDeviceInfo, ignore, port, progress, ref1, ref2, ref3, ref4, ref5, ref6, skipGitignore, skipRestart, syncContainer, uuid, verbose;
  ref1 = arg != null ? arg : {}, uuid = ref1.uuid, baseDir = ref1.baseDir, destination = ref1.destination, before = ref1.before, after = ref1.after, ignore = ref1.ignore, port = (ref2 = ref1.port) != null ? ref2 : 22, skipGitignore = (ref3 = ref1.skipGitignore) != null ? ref3 : false, skipRestart = (ref4 = ref1.skipRestart) != null ? ref4 : false, progress = (ref5 = ref1.progress) != null ? ref5 : false, verbose = (ref6 = ref1.verbose) != null ? ref6 : false;
  if (destination == null) {
    throw new Error("'destination' is a required sync option");
  }
  if (uuid == null) {
    throw new Error("'uuid' is a required sync option");
  }
  getDeviceInfo = function(uuid) {
    var RequiredDeviceObjectFields, ensureDeviceRequirements;
    RequiredDeviceObjectFields = ['uuid', 'os_version'];
    ensureDeviceRequirements = function(device) {
      return resin.auth.getUserId().then(function(userId) {
        if (userId !== device.user.__id) {
          throw new Error('Resin sync is permitted to the device owner only. The device owner is the user who provisioned it.');
        }
      }).then(function() {
        return ensureHostOSCompatibility(device.os_version, MIN_HOSTOS_RSYNC);
      }).then(function() {
        var missingKeys;
        missingKeys = _.difference(RequiredDeviceObjectFields, _.keys(device));
        if (missingKeys.length > 0) {
          throw new Error("Fetched device info is missing required fields '" + (missingKeys.join("', '")) + "'");
        }
        return device;
      });
    };
    console.info("Getting information for device: " + uuid);
    return resin.models.device.isOnline(uuid).then(function(isOnline) {
      if (!isOnline) {
        throw new Error('Device is not online');
      }
      return resin.models.device.get(uuid);
    }).then(ensureDeviceRequirements).then(function(arg1) {
      var uuid;
      uuid = arg1.uuid;
      return {
        fullUuid: uuid
      };
    });
  };
  syncContainer = Promise.method(function(arg1) {
    var baseDir, command, containerId, destination, fullUuid, ref7, syncOptions, username;
    fullUuid = arg1.fullUuid, username = arg1.username, containerId = arg1.containerId, baseDir = (ref7 = arg1.baseDir) != null ? ref7 : process.cwd(), destination = arg1.destination;
    if (containerId == null) {
      throw new Error('No application container found');
    }
    syncOptions = {
      username: username,
      host: "ssh." + (settings.get('proxyUrl')),
      source: baseDir,
      destination: destination,
      ignore: ignore,
      skipGitignore: skipGitignore,
      verbose: verbose,
      port: port,
      progress: progress,
      extraSshOptions: username + "@ssh." + (settings.get('proxyUrl')) + " rsync " + fullUuid + " " + containerId
    };
    command = buildRsyncCommand(syncOptions);
    return new SpinnerPromise({
      promise: shell.runCommand(command, {
        cwd: baseDir
      }),
      startMessage: "Syncing to " + destination + " on " + (fullUuid.substring(0, 7)) + "...",
      stopMessage: "Synced " + destination + " on " + (fullUuid.substring(0, 7)) + "."
    });
  });
  return Promise.props({
    fullUuid: getDeviceInfo(uuid).get('fullUuid'),
    username: resin.auth.whoami()
  }).tap(function() {
    if (before != null) {
      return shell.runCommand(before, baseDir);
    }
  }).then(function(arg1) {
    var fullUuid, username;
    fullUuid = arg1.fullUuid, username = arg1.username;
    return infoContainerSpinner(resin.models.device.getApplicationInfo(fullUuid)).then(function(arg2) {
      var containerId;
      containerId = arg2.containerId;
      return syncContainer({
        fullUuid: fullUuid,
        username: username,
        containerId: containerId,
        baseDir: baseDir,
        destination: destination
      }).then(function() {
        if (skipRestart === false) {
          return stopContainerSpinner(resin.models.device.stopApplication(fullUuid)).then(function() {
            return startContainerSpinner(resin.models.device.startApplication(fullUuid));
          });
        }
      }).then(function() {
        if (after != null) {
          return shell.runCommand(after, baseDir);
        }
      }).then(function() {
        return console.log(chalk.green.bold('\nresin sync completed successfully!'));
      })["catch"](function(err) {
        return startContainerAfterErrorSpinner(resin.models.device.startApplication(fullUuid))["catch"](function(err) {
          return console.log('Could not start application container', err);
        })["throw"](err);
      });
    });
  })["catch"](function(err) {
    console.log(chalk.red.bold('resin sync failed.', err));
    throw err;
  });
};
