import { ExcalidrawElement } from "./element/types";
import { getSelectedElements } from "./scene";

let CLIPBOARD = "";
let PREFER_APP_CLIPBOARD = false;

export const probablySupportsClipboardReadText =
  "clipboard" in navigator && "readText" in navigator.clipboard;

export const probablySupportsClipboardWriteText =
  "clipboard" in navigator && "writeText" in navigator.clipboard;

export const probablySupportsClipboardBlob =
  "clipboard" in navigator &&
  "write" in navigator.clipboard &&
  "ClipboardItem" in window &&
  "toBlob" in HTMLCanvasElement.prototype;

export async function copyToAppClipboard(
  elements: readonly ExcalidrawElement[],
) {
  CLIPBOARD = JSON.stringify(
    getSelectedElements(elements).map(({ shape, ...el }) => el),
  );
  try {
    // when copying to in-app clipboard, clear system clipboard so that if
    //  system clip contains text on paste we know it was copied *after* user
    //  copied elements, and thus we should prefer the text content.
    await copyTextToSystemClipboard(null);
    PREFER_APP_CLIPBOARD = false;
  } catch (err) {
    // if clearing system clipboard didn't work, we should prefer in-app
    //  clipboard even if there's text in system clipboard on paste, because
    //  we can't be sure of the order of copy operations
    PREFER_APP_CLIPBOARD = true;
  }
}

export function getAppClipboard(): {
  elements?: readonly ExcalidrawElement[];
} {
  try {
    const clipboardElements = JSON.parse(CLIPBOARD);

    if (
      Array.isArray(clipboardElements) &&
      clipboardElements.length > 0 &&
      clipboardElements[0].type // need to implement a better check here...
    ) {
      return { elements: clipboardElements };
    }
  } catch (err) {
    console.error(err);
  }

  return {};
}

export async function getClipboardContent(
  e: ClipboardEvent | null,
): Promise<{
  text?: string;
  elements?: readonly ExcalidrawElement[];
}> {
  try {
    const text = e
      ? e.clipboardData?.getData("text/plain").trim()
      : probablySupportsClipboardReadText &&
        (await navigator.clipboard.readText());

    if (text && !PREFER_APP_CLIPBOARD) {
      return { text };
    }
  } catch (err) {
    console.error(err);
  }

  return getAppClipboard();
}

export async function copyCanvasToClipboardAsPng(canvas: HTMLCanvasElement) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(async function(blob: any) {
        try {
          await navigator.clipboard.write([
            new window.ClipboardItem({ "image/png": blob }),
          ]);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function copyTextToSystemClipboard(text: string | null) {
  let copied = false;
  if (probablySupportsClipboardWriteText) {
    try {
      // NOTE: doesn't work on FF on non-HTTPS domains, or when document
      //  not focused
      await navigator.clipboard.writeText(text || "");
      copied = true;
    } catch (err) {}
  }

  // Note that execCommand doesn't allow copying empty strings, so if we're
  //  clearing clipboard using this API, we must copy at least an empty char
  if (!copied && !copyTextViaExecCommand(text || " ")) {
    throw new Error("couldn't copy");
  }
}

// adapted from https://github.com/zenorocha/clipboard.js/blob/ce79f170aa655c408b6aab33c9472e8e4fa52e19/src/clipboard-action.js#L48
function copyTextViaExecCommand(text: string) {
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  const textarea = document.createElement("textarea");

  textarea.style.border = "0";
  textarea.style.padding = "0";
  textarea.style.margin = "0";
  textarea.style.position = "absolute";
  textarea.style[isRTL ? "right" : "left"] = "-9999px";
  const yPosition = window.pageYOffset || document.documentElement.scrollTop;
  textarea.style.top = `${yPosition}px`;
  // Prevent zooming on iOS
  textarea.style.fontSize = "12pt";

  textarea.setAttribute("readonly", "");
  textarea.value = text;

  document.body.appendChild(textarea);

  let success = false;

  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    success = document.execCommand("copy");
  } catch (err) {}

  textarea.remove();

  return success;
}
