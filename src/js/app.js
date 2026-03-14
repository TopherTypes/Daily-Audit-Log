import { todayAsLocalDateString } from "./utils/date.js";
import { createUiHandlers } from "./ui/events.js";
import { createSpeechController } from "./services/speech.js";

function collectElements() {
  return {
    form: document.getElementById("auditForm"),
    entryDate: document.getElementById("entryDate"),
    feeling: document.getElementById("feeling"),
    mattered: document.getElementById("mattered"),
    offCourse: document.getElementById("offCourse"),
    supported: document.getElementById("supported"),
    remember: document.getElementById("remember"),
    needNext: document.getElementById("needNext"),
    formMessage: document.getElementById("formMessage"),
    dataMessage: document.getElementById("dataMessage"),
    entriesList: document.getElementById("entriesList"),
    reviewResult: document.getElementById("reviewResult"),
    speechStatus: document.getElementById("speechStatus"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    importJsonTrigger: document.getElementById("importJsonTrigger"),
    importJsonInput: document.getElementById("importJsonInput"),
    clearDataBtn: document.getElementById("clearDataBtn"),
    resetFormBtn: document.getElementById("resetFormBtn"),
    showRecentBtn: document.getElementById("showRecentBtn"),
    workerBaseUrlInput: document.getElementById("workerBaseUrl"),
    syncKeyInput: document.getElementById("syncKey"),
    syncSecretInput: document.getElementById("syncSecret"),
    saveSyncSettingsBtn: document.getElementById("saveSyncSettingsBtn"),
    pullFromCloudBtn: document.getElementById("pullFromCloudBtn"),
    syncSettingsMessage: document.getElementById("syncSettingsMessage"),
    syncStatusBox: document.getElementById("syncStatusBox"),
    syncOverlay: document.getElementById("syncOverlay"),
    syncOverlayMessage: document.getElementById("syncOverlayMessage"),
    micButtons: Array.from(document.querySelectorAll(".mic-btn"))
  };
}

export function init() {
  const elements = collectElements();
  const uiHandlers = createUiHandlers(elements);

  const speechController = createSpeechController({
    micButtons: elements.micButtons,
    setStatus: uiHandlers.setSpeechStatus,
    onTranscript: uiHandlers.appendTranscriptToField
  });
  uiHandlers.setSpeechController(speechController);

  const boundHandlers = uiHandlers.bind();
  elements.entryDate.value = todayAsLocalDateString();
  boundHandlers.refreshEntries();
  boundHandlers.loadSyncSettingsIntoForm();
  boundHandlers.updateSyncStatusBox();
  speechController.setup();
}

init();
