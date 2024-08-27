const childProcess = require("child_process");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((value, index, array) => (value.startsWith("--") && !array[index + 1]?.startsWith("--")) ? [value.substring(2), array[index + 1]] : null).filter(i => i));

const config = { ...require("./config.json"), ...getArgsConfig() };

let deviceId;

(async () => {
    if (!config.ipa) return console.log("No IPA file provided!");
    if (!config.appleId) return console.log("No Apple ID provided!");
    if (!config.password) return console.log("No password provided!");

    console.log("Starting Anisette Server...");
    await startAnisetteServer();

    if (!config.deviceId) {
        await (async function getDeviceId() {
            console.log("Getting device ID's...");
            const deviceIds = await getDeviceIds().catch(err => console.log(err));
            if (!deviceIds?.length) {
                console.log("Couldn't get device ID's!");
                await sleep(5 * 1000);
                return getDeviceId();
            }
            console.log(`Got Device ID's:\n${deviceIds.join("\n")}`);
            deviceId = deviceIds[0];
            console.log(`Using device ID: ${deviceId}`);
        })();
    } else deviceId = config.deviceId;

    // console.log("Starting Sideloader...");
    // await startSideloader();
    console.log(`Sideloading IPA '${config.ipa}'`);
    await sideload();
})();

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}

function getArgsConfig() {
    return {
        deviceId: args.id,
        ipa: args.ipa ? path.resolve(args.ipa) : null,
        host: args.host || "127.0.0.1",
        port: args.port || "4202",
        appleId: args.appleid || args.email,
        password: args.password || args.pwd
    }
}

function startAnisetteServer() {
    return new Promise((resolve, reject) => {
        const proc = childProcess.spawn(path.resolve(config.anisetteServerBinPath), ["--host", config.host, "--port", config.port]);
        const timeout = setTimeout(() => {
            reject("Timed out");
        }, 10 * 1000);
        proc.stdout.on("data", data => {
            // process.stdout.write(data);
            if (data.toString().includes("Ready! Serving data.")) {
                clearTimeout(timeout);
                resolve();
            }
        });
        // proc.on("exit", code => code > 0 ? reject() : null);
        proc.on("exit", code => reject());
    });
}

function getDeviceIds() {
    return new Promise((resolve, reject) => {
        childProcess.exec(path.resolve(config.idevice_idBinPath), (err, stdout) => {
            if (err) return reject("Failed to get device ID's, make sure a device is plugged in and that you have libimobiledevice!");
            const ids = Array.from(stdout.toString().matchAll(/^([0-9A-Z-]*) ?/gm) || []).filter(i => i[1]).map(i => i[1]);
            resolve(ids);
        });
    });
}

function startSideloader() {
}

function sideload() {
    return new Promise((resolve, reject) => {
        const proc = childProcess.spawn(path.resolve(config.sideloaderPath), ["--udid", deviceId, "--appleID", config.appleId, "--password", config.password, config.ipa], { env: { ALTSERVER_ANISETTE_SERVER: `http://${config.host}:${config.port}` } });
        proc.on("exit", code => code > 0 ? reject() : resolve());
        // proc.stdout.on("data", i => process.stdout.write(i));
        // process.stdin.on("data", i => proc.stdin.write(i));
        proc.stdout.on("data", data => {
            process.stdout.write(data);
            if (data.toString().includes("Enter two factor code")) {
                console.log("Enter verification code:");
                process.stdin.once("data", data => {
                    proc.stdin.write(data);
                    console.log("Continuing...");
                });
            }
        });
    });
}