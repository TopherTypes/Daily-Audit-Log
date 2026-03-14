const QUESTION_SCHEMA_REQUIRED_KEYS = ["id", "label", "placeholder", "maxLength", "supportsSpeech", "type"];

export const QUESTION_SCHEMA = [
  {
    id: "feeling",
    label: "How do I feel?",
    placeholder: "A quick read on your internal weather...",
    maxLength: 2000,
    supportsSpeech: true,
    type: "textarea"
  },
  {
    id: "mattered",
    label: "What mattered today?",
    placeholder: "What had weight, meaning, or importance?",
    maxLength: 2000,
    supportsSpeech: true,
    type: "textarea"
  },
  {
    id: "offCourse",
    label: "What pulled me off course?",
    placeholder: "What disrupted, distracted, or derailed things?",
    maxLength: 2000,
    supportsSpeech: true,
    type: "textarea"
  },
  {
    id: "supported",
    label: "What supported me today?",
    placeholder: "What helped, steadied, or moved things in the right direction?",
    maxLength: 2000,
    supportsSpeech: true,
    type: "textarea"
  },
  {
    id: "remember",
    label: "What do I want to remember?",
    placeholder: "A moment, lesson, insight, or fragment worth keeping...",
    maxLength: 2000,
    supportsSpeech: true,
    type: "textarea"
  },
  {
    id: "needNext",
    label: "What do I need next?",
    placeholder: "The next support, focus, or helpful step...",
    maxLength: 2000,
    supportsSpeech: true,
    type: "textarea"
  }
];

function isDevelopmentEnvironment() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.protocol === "file:";
}

export function validateQuestionSchema(schema = QUESTION_SCHEMA) {
  const errors = [];

  schema.forEach((field, index) => {
    const missingKeys = QUESTION_SCHEMA_REQUIRED_KEYS.filter(key => field[key] === undefined || field[key] === null);
    if (missingKeys.length > 0) {
      errors.push(`QUESTION_SCHEMA[${index}] is missing required keys: ${missingKeys.join(", ")}`);
    }

    if (field.type !== "textarea") {
      errors.push(`QUESTION_SCHEMA[${index}] has unsupported type "${field.type}" for id "${field.id}".`);
    }

    if (typeof field.maxLength !== "number" || !Number.isFinite(field.maxLength) || field.maxLength <= 0) {
      errors.push(`QUESTION_SCHEMA[${index}] has invalid maxLength for id "${field.id}".`);
    }
  });

  if (errors.length > 0) {
    errors.forEach(message => console.error(message));
    if (isDevelopmentEnvironment()) {
      throw new Error("Invalid QUESTION_SCHEMA. See console errors for details.");
    }
  }

  return errors;
}
