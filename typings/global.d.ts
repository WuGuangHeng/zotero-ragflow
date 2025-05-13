declare const _globalThis: {
    [key: string]: any;
    Zotero: _ZoteroTypes.Zotero;
    ztoolkit: ZToolkit;
    addon: typeof addon;
  };
  
declare type ZToolkit = ReturnType<
typeof import("../src/utils/ztoolkit").createZToolkit
>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import("../src/addon").default;

declare const __env__: "production" | "development";

declare const Zotero: any;

declare namespace Components {
    const utils: any;
    const interfaces: any;
    const classes: any;
}

declare namespace Services {
    const prefs: any;
    const obs: any;
    const strings: any;
    const wm: any;
}

declare const Cu: {
    import: (url: string, scope?: object) => any;
    importGlobalProperties: (props: string[]) => void;
};

declare const ChromeUtils: {
    defineModuleGetter: (obj: any, prop: string, url: string) => void;
    import: (url: string) => Promise<any>;
};

declare const XPCOMUtils: {
    defineLazyGetter: (obj: any, prop: string, getter: () => any) => void;
    defineLazyModuleGetter: (obj: any, prop: string, resource: string) => void;
};

// DOM elements in XUL
declare namespace XUL {
    interface Element extends HTMLElement {
        // Common XUL attributes
        id?: string;
        class?: string;
        hidden?: boolean;
        collapsed?: boolean;
        flex?: string | number;

        // Event handlers
        oncommand?: (event: Event) => void;

        // Common XUL methods
        focus(): void;
        blur(): void;
        click(): void;
        doCommand(): void;

        // Common XUL properties
        value?: string;
        label?: string;
        checked?: boolean;
        disabled?: boolean;
        readonly?: boolean;
        selectedIndex?: number;
        selectedItem?: Element;
    }

    interface Button extends Element {
        type?: "button" | "menu" | "menu-button";
        image?: string;
    }

    interface Textbox extends Element {
        type?: "text" | "password" | "number";
        maxLength?: number;
        placeholder?: string;
        value: string;
        readonly?: boolean;
    }

    interface Menu extends Element {
        open?: boolean;
    }

    interface Menuitem extends Element {
        type?: "checkbox" | "radio";
        name?: string;
        selected?: boolean;
    }

    interface Tree extends Element {
        view?: any;
        columns?: any;
    }

    interface Tabbox extends Element {
        selectedIndex?: number;
        selectedTab?: Element;
        selectedPanel?: Element;
    }

    interface Tab extends Element {
        selected?: boolean;
    }

    interface Panel extends Element {
        noautofocus?: boolean;
        noautohide?: boolean;
    }

    interface Popup extends Element {
        position?: string;
    }
}

declare interface Window {
    arguments?: any[];
    [key: string]: any;
}
