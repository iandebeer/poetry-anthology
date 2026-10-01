/** Keep reference numbers smaller than the surrounding poem and note text. */
export const poemReferenceStyles =
  'sup[id^="fnref-"]{font-size:0.6em;line-height:0;vertical-align:super}' +
  'sup[id^="fnref-"] a{font-size:inherit;text-decoration:none}' +
  '.footnotes li::marker{font-size:0.6em}';
