import { useIpfs } from "@/hooks/useIpfs";
import { useRobonomics } from "@/hooks/useRobonomics";
import {
  decryptMsg,
  getConfigCid,
  getLastDatalog,
  parseJson
} from "@/utils/telemetry";
import { Keyring } from "@polkadot/keyring";
import { ref, watch } from "vue";
import { useStore } from "vuex";

export const chainSS58 = 32;

const catFile = async (store, ipfs, cid) => {
  if (!cid) {
    return false;
  }
  try {
    return await ipfs.catViaGateway(
      store.state.robonomicsUIvue.ipfs.activegateway,
      cid,
      2
    );
  } catch (_) {
    try {
      const res = await ipfs.catViaGateways(
        store.state.robonomicsUIvue.ipfs.gateways,
        cid
      );
      store.commit("ipfs/setActiveGateway", res.gateway);
      return res.result;
    } catch (error) {
      console.log(error.message);
    }
  }
  return false;
};

export const decryptMsgContoller = async (
  encryptedMsg,
  controller,
  keyring
) => {
  if (encryptedMsg) {
    try {
      const seed = decryptMsg(
        encryptedMsg[controller.address],
        controller.publicKey,
        controller
      );
      const admin = keyring.addFromUri(seed, {}, "ed25519");
      const data = decryptMsg(encryptedMsg.data, controller.publicKey, admin);
      return parseJson(data);
    } catch (error) {
      console.log(error.message);
    }
  }
  return false;
};

export const catFileController = async (
  cid,
  controller,
  store,
  ipfs,
  keyring
) => {
  if (cid) {
    const data = await catFile(store, ipfs, cid);
    if (!data) {
      console.log(`Error: ${cid} not found in ipfs`);
      return null;
    }
    const result = await decryptMsgContoller(data, controller, keyring);
    if (result) {
      return result;
    } else {
      console.log(`Error: decryptMsg`);
    }
  }
  return null;
};

const loadSetup = (store, keyring) => {
  if (!store.state.robonomicsUIvue.rws.active) {
    return;
  }
  const setupRaw = store.state.robonomicsUIvue.rws.list.find(
    (item) => item.owner === store.state.robonomicsUIvue.rws.active
  );
  if (setupRaw) {
    try {
      return {
        controller: keyring.addFromUri(setupRaw.scontroller, {}, "ed25519"),
        owner: setupRaw.owner
      };
    } catch (error) {
      console.log(error);
    }
  }
  return {
    controller: null,
    owner: null
  };
};

export const useSetup = () => {
  const controller = ref(null);
  const owner = ref(null);

  const store = useStore();

  const keyring = new Keyring({
    ss58Format: chainSS58
  });

  watch(
    () => store.state.robonomicsUIvue.rws.active,
    () => {
      const setup = loadSetup(store, keyring);
      controller.value = setup.controller;
      owner.value = setup.owner;
    },
    { immediate: true }
  );

  return { controller, owner };
};

export const notify = (store, text, timeout = 3000) => {
  store.dispatch("app/setStatus", {
    value: text,
    timeout
  });
  console.log(text);
};

export const setStatusLaunch = (store, command, status) => {
  store.commit(
    "rws/setLaunch",
    JSON.stringify({ ...command, tx: { tx_status: status } })
  );
};

export const useLastDatalog = () => {
  const cid = ref(null);
  const updateTime = ref(null);
  const data = ref(null);

  const store = useStore();
  const ipfs = useIpfs();
  const robonomics = useRobonomics();
  const { controller } = useSetup();

  const keyring = new Keyring({
    ss58Format: chainSS58
  });

  (async () => {
    const datalog = await getLastDatalog(robonomics, controller.value.address);
    cid.value = datalog.cid;
    updateTime.value = datalog.timestamp;
    data.value = await catFileController(
      cid.value,
      controller.value,
      store,
      ipfs,
      keyring
    );
  })();

  return { cid, updateTime, data };
};

export const useConfig = () => {
  const cid = ref(null);
  const config = ref(null);

  const store = useStore();
  const ipfs = useIpfs();
  const robonomics = useRobonomics();
  const { controller } = useSetup();

  const keyring = new Keyring({
    ss58Format: chainSS58
  });

  (async () => {
    notify(store, "Find twin id");
    const datalog = await getLastDatalog(robonomics, controller.value.address);
    const result = await catFileController(
      datalog.cid,
      controller.value,
      store,
      ipfs,
      keyring
    );

    if (result) {
      const twin_id = result.twin_id;
      notify(store, `Twin id #${twin_id}`);

      notify(store, `Start load config`);
      cid.value = await getConfigCid(
        robonomics,
        controller.value.address,
        twin_id
      );

      config.value = await catFileController(
        cid.value,
        controller.value,
        store,
        ipfs,
        keyring
      );
      notify(store, `Config loaded`);
    } else {
      notify(store, "Error: not found twin id");
    }
  })();

  return { config, cid };
};
