import {
  ImageNotReadableError,
  MAXIMUM_IMAGE_BYTES,
  prepareImageForModel,
} from "../../images/prepareImageForModel.js";
import {
  findDocument,
  type OverleafBinaryFileEntry,
} from "../../overleaf/realtime/overleafProjectDocuments.js";
import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";
import { downloadProjectFile } from "../../overleaf/web/files/projectFileDownload.js";
import { DownloadTooLargeError } from "../../overleaf/web/overleafWebErrors.js";
import { createEditorProjectSourceReader } from "../latex/editorProjectSourceReader.js";
import {
  describeUnreadableBinaryFile,
  imageToolResult,
  isImageFilePath,
} from "../reading/images/imageFiles.js";
import { readFileWithIncludes } from "../reading/includes/readFileWithIncludes.js";
import { presentFileText } from "../reading/presentFileText.js";
import { requireDocument } from "../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../toolContext.js";
import { requireOverleafWebClient } from "../web/requireOverleafWebClient.js";

/** One read_file call on Overleaf's editor, its arguments already checked against each other. */
export interface EditorFileRead {
  readonly path: string;
  readonly startLine?: number | undefined;
  readonly endLine?: number | undefined;
  readonly sectionTitle?: string | undefined;
  readonly followIncludes?: boolean | undefined;
}

/** An uploaded figure, downloaded no further than the most an image sent to the model may have. */
async function readUploadedImage(
  context: ToolContext,
  session: OverleafRealtimeSession,
  upload: OverleafBinaryFileEntry,
): Promise<ToolTextResult> {
  let bytes: Buffer;
  try {
    bytes = await downloadProjectFile(
      requireOverleafWebClient(context),
      session.project.projectId,
      upload.fileId,
      MAXIMUM_IMAGE_BYTES,
    );
  } catch (error) {
    if (!(error instanceof DownloadTooLargeError)) throw error;
    throw new ImageNotReadableError(
      `${upload.path} is larger than the ${MAXIMUM_IMAGE_BYTES} bytes an image sent to the model may have. Upload a smaller or more compressed copy (for example a JPEG, or a PNG scaled down) and read that.`,
    );
  }
  return imageToolResult(upload.path, prepareImageForModel(bytes, upload.path));
}

/** An upload is shown when it is an image and otherwise refused, saying what to do instead. */
function readUpload(
  context: ToolContext,
  session: OverleafRealtimeSession,
  upload: OverleafBinaryFileEntry,
): Promise<ToolTextResult> {
  if (isImageFilePath(upload.path)) return readUploadedImage(context, session, upload);
  throw new Error(
    `${describeUnreadableBinaryFile(upload.path)} manage_project (action download_zip) saves the whole project, this file included.`,
  );
}

/** A document's text as the editor holds it, flattened when asked, or an uploaded figure. */
export async function readFromEditor(
  context: ToolContext,
  session: OverleafRealtimeSession,
  read: EditorFileRead,
): Promise<ToolTextResult> {
  const normalisedPath = read.path.replace(/^\.?\//, "");
  if (read.followIncludes) {
    return textResult(await readFileWithIncludes(createEditorProjectSourceReader(session), normalisedPath));
  }
  const upload = findDocument(session.project, read.path)
    ? undefined
    : session.project.binaryFiles.find((file) => file.path === normalisedPath);
  if (upload) return readUpload(context, session, upload);
  const document = requireDocument(session, read.path);
  const joined = await session.joinDocument(document.documentId);
  const { sectionTitle, startLine, endLine } = read;
  return textResult(
    presentFileText(document.path, joined.lines.join("\n"), { sectionTitle, startLine, endLine }),
  );
}
