/**
 * XUL Element Types
 * 
 * These type definitions are for XUL elements used in Zotero extensions.
 * Reference: https://developer.mozilla.org/en-US/docs/Archive/Mozilla/XUL
 */

declare namespace XUL {
  interface XULElement extends HTMLElement {
    readonly localName: string;
    readonly namespaceURI: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  }

  interface Box extends XULElement {
    orient?: "horizontal" | "vertical";
    flex?: number;
    align?: "start" | "center" | "end" | "baseline" | "stretch";
    pack?: "start" | "center" | "end";
  }

  interface TabBox extends Box {
    selectedTab: Tab | null;
    selectedPanel: TabPanel | null;
    handleCtrlTab: boolean;
    handleCtrlPageUpDown: boolean;
  }

  interface TabPanel extends Box {
    selected: boolean;
  }

  interface Tab extends XULElement {
    selected: boolean;
    linkedPanel: TabPanel | null;
    readonly control: TabBox | null;
  }

  interface Deck extends Box {
    selectedIndex: number;
    selectedPanel: XULElement | null;
  }

  interface Button extends XULElement {
    type?: "checkbox" | "radio" | "menu" | "menu-button";
    disabled?: boolean;
    checked?: boolean;
    label?: string;
    image?: string;
    command?: string;
  }

  interface Toolbar extends Box {
    customizable?: boolean;
    mode?: "icons" | "text" | "full";
  }

  interface Splitter extends XULElement {
    state?: "open" | "collapsed" | "dragging";
    resizeafter?: "closest" | "farthest" | "grow";
    resizebefore?: "closest" | "farthest" | "grow";
  }
}

declare interface Document {
  getElementById(elementId: string): XUL.XULElement | HTMLElement | null;
  querySelector<K extends keyof XUL.XULElement>(selectors: K): XUL.XULElement | null;
  querySelector(selectors: string): Element | null;
  querySelectorAll<K extends keyof XUL.XULElement>(selectors: K): NodeListOf<XUL.XULElement>;
  querySelectorAll(selectors: string): NodeListOf<Element>;
}

declare interface Window {
  getBrowser(): XUL.Box;
  getMainWindow(): Window;
}
