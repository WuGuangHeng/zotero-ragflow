import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "../addon";

declare global {
  const Zotero: _ZoteroTypes.Zotero;
  const ZoteroPane: _ZoteroTypes.ZoteroPane;
  const Services: _ZoteroTypes.Services;
  const ztoolkit: BasicTool;
  const addon: Addon;

  // Add any other global types here
  interface Window {
    Zotero: _ZoteroTypes.Zotero;
    ZoteroPane: _ZoteroTypes.ZoteroPane;
    ztoolkit: BasicTool;
    addon: Addon;
  }
}
