import { QUESTION_SCHEMA, validateQuestionSchema } from "./config/questions.js";
import { createSpeechController } from "./services/speech.js";
import { createUiHandlers } from "./ui/events.js";
import { renderAuditQuestionFields } from "./ui/render.js";
import { todayAsLocalDateString } from "./utils/date.js";

function collectElements() {
  const questionInputs = Object.fromEntries(
    QUESTION_SCHEMA.map(question => [question.id, document.getElementById(question.id)])
  );

  return {
    form: document.getElementById("auditForm"),
    entryDate: document.getElementById("entryDate"),
    questionInputs,
    formMessage: document.getElementById("formMessage"),
    stickySaveFeedback: document.getElementById("stickySaveFeedback"),
    dataMessage: document.getElementById("dataMessage"),
    entriesList: document.getElementById("entriesList"),
    reviewResult: document.getElementById("reviewResult"),
    speechStatus: document.getElementById("speechStatus"),
    saveLiveRegion: document.getElementById("saveLiveRegion"),
    syncLiveRegion: document.getElementById("syncLiveRegion"),
    speechLiveRegion: document.getElementById("speechLiveRegion"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    importJsonTrigger: document.getElementById("importJsonTrigger"),
    importJsonInput: document.getElementById("importJsonInput"),
    clearDataBtn: document.getElementById("clearDataBtn"),
    resetFormBtn: document.getElementById("resetFormBtn"),
    recentFilter: document.getElementById("recentFilter"),
    customDateFilters: document.getElementById("customDateFilters"),
    customStartDate: document.getElementById("customStartDate"),
    customEndDate: document.getElementById("customEndDate"),
    tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
    tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
    accordions: Array.from(document.querySelectorAll(".mobile-accordion")),
    workerBaseUrlInput: document.getElementById("workerBaseUrl"),
    syncKeyInput: document.getElementById("syncKey"),
    syncSecretInput: document.getElementById("syncSecret"),
    saveSyncSettingsBtn: document.getElementById("saveSyncSettingsBtn"),
    pullFromCloudBtn: document.getElementById("pullFromCloudBtn"),
    syncSettingsMessage: document.getElementById("syncSettingsMessage"),
    syncStatusBox: document.getElementById("syncStatusBox"),
    syncOverlay: document.getElementById("syncOverlay"),
    syncOverlayMessage: document.getElementById("syncOverlayMessage"),
    micButtons: Array.from(document.querySelectorAll(".mic-btn")),
    themeToggleBtn: document.getElementById("themeToggleBtn")
  };
}

export function init() {
  validateQuestionSchema();
  renderAuditQuestionFields(document.getElementById("questionFields"));

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
  boundHandlers.loadSyncSettingsIntoForm();
  boundHandlers.updateSyncStatusBox();
  speechController.setup();
}

init();
