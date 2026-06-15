(() => {
  const DEFAULT_SHEETS_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbyJ3Q02dOX95sWe2jq22zFmlcFYZ2iHP3LJdEjcF9_MYwodJb4xsA4vWywsK9Qgr00hSg/exec";

  function getEndpoint() {
    const configuredEndpoint =
      window.KONTAKT_SHEETS_ENDPOINT || DEFAULT_SHEETS_ENDPOINT;

    if (!configuredEndpoint || configuredEndpoint.includes("REPLACE_WITH_YOUR_WEB_APP_ID")) {
      throw new Error(
        "Google Sheets endpoint missing. Set window.KONTAKT_SHEETS_ENDPOINT in scripts/kontakt-forms.js.",
      );
    }

    return configuredEndpoint;
  }

  function parseStoredState(storageKey) {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch {
      window.localStorage.removeItem(storageKey);
      return null;
    }
  }

  function writeStoredState(storageKey, state) {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function collectFields(root) {
    const elements = root.querySelectorAll("input[name], select[name], textarea[name]");
    const data = {};

    elements.forEach((element) => {
      const { name, type } = element;

      if (!name || element.disabled) {
        return;
      }

      if (type === "checkbox") {
        if (!Array.isArray(data[name])) {
          data[name] = [];
        }

        if (element.checked) {
          data[name].push(element.value);
        }

        return;
      }

      if (type === "radio") {
        if (element.checked) {
          data[name] = element.value;
        } else if (!(name in data)) {
          data[name] = "";
        }

        return;
      }

      data[name] = element.value;
    });

    return data;
  }

  function restoreFields(root, fields) {
    if (!fields) {
      return;
    }

    const elements = root.querySelectorAll("input[name], select[name], textarea[name]");

    elements.forEach((element) => {
      const storedValue = fields[element.name];

      if (typeof storedValue === "undefined") {
        return;
      }

      if (element.type === "checkbox") {
        element.checked = Array.isArray(storedValue)
          ? storedValue.includes(element.value)
          : Boolean(storedValue);
        return;
      }

      if (element.type === "radio") {
        element.checked = storedValue === element.value;
        return;
      }

      element.value = storedValue;
    });
  }

  function setButtonPending(button, pendingText) {
    if (!button) {
      return () => {};
    }

    const originalHtml = button.innerHTML;
    const originalDisabled = button.disabled;

    button.disabled = true;
    if (pendingText) {
      button.textContent = pendingText;
    }

    return () => {
      button.disabled = originalDisabled;
      button.innerHTML = originalHtml;
    };
  }

  function buildPayload(formName, root, extraPayload) {
    return {
      form: formName,
      page: window.location.pathname,
      submittedAt: new Date().toISOString(),
      userAgent: window.navigator.userAgent,
      data: collectFields(root),
      ...extraPayload,
    };
  }

  async function postToSheets(payload) {
    const response = await fetch(getEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseBody = null;

    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
    }

    if (!response.ok) {
      throw new Error(`Google Sheets request failed with status ${response.status}.`);
    }

    if (responseBody && typeof responseBody === "object" && responseBody.ok === false) {
      throw new Error(responseBody.error || "Google Sheets request failed.");
    }

    return responseBody;
  }

  function init(options) {
    const root = document.querySelector(options.rootSelector);

    if (!root) {
      return null;
    }

    const storageKey = options.storageKey;
    const persist = () => {
      const state = {
        fields: collectFields(root),
        ...(typeof options.getExtraState === "function"
          ? options.getExtraState()
          : {}),
      };

      writeStoredState(storageKey, state);
    };

    const storedState = parseStoredState(storageKey);
    restoreFields(root, storedState?.fields);

    if (typeof options.afterRestore === "function") {
      options.afterRestore(storedState, root);
    }

    root.addEventListener("input", persist);
    root.addEventListener("change", persist);

    persist();

    return {
      clear() {
        window.localStorage.removeItem(storageKey);
      },
      getStoredState() {
        return parseStoredState(storageKey);
      },
      save: persist,
      root,
    };
  }

  async function submit(options) {
    const root = document.querySelector(options.rootSelector);

    if (!root) {
      throw new Error(`Form root not found: ${options.rootSelector}`);
    }

    const restoreButton = setButtonPending(options.submitButton, options.pendingText);

    try {
      const payload = buildPayload(options.formName, root, options.extraPayload);
      const responseBody = await postToSheets(payload);

      if (options.storageKey) {
        window.localStorage.removeItem(options.storageKey);
      }

      if (typeof options.onSuccess === "function") {
        options.onSuccess(payload, responseBody);
      }

      return responseBody;
    } catch (error) {
      if (typeof options.onError === "function") {
        options.onError(error);
      } else {
        window.alert(
          "Beim Senden gab es ein Problem. Bitte versuch es gleich noch einmal.",
        );
      }

      throw error;
    } finally {
      restoreButton();
    }
  }

  window.kontaktFormStore = {
    init,
    submit,
  };
})();
