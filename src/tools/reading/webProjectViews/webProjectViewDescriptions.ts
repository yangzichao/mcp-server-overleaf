/**
 * The two read_project views that read Overleaf's web application through the session cookie,
 * described the same way in both versions of the tool.
 */

export const MEMBERS_VIEW_SENTENCE =
  "members lists who the project is shared with: the owner, each invited collaborator with their access level, and pending invitations, which Overleaf shows only to the owner; sharing itself is changed in Overleaf's Share menu, not here.";

export const WORD_COUNT_VIEW_SENTENCE =
  "word_count gives Overleaf's own word count, from texcount on Overleaf's servers, for path or for the main document set in Overleaf's menu, with the files it includes: words in text, in headings and outside text such as captions, and how many headings, floats and math expressions there are.";

export const WORD_COUNT_PATH_NOTE =
  "word_count view: the document to count, with the files it includes, default the main document set in Overleaf's menu.";
