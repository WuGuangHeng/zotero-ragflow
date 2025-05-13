/**
 * Plugin version information
 */
export const VERSION = {
    MAJOR: 0,
    MINOR: 1,
    PATCH: 0,
    /** Full version string in semver format */
    toString(): string {
        return `${this.MAJOR}.${this.MINOR}.${this.PATCH}`;
    }
};

/**
 * Check if current version is newer than another version
 */
export function isNewerVersion(current: string, other: string): boolean {
    const currentParts = current.split(".").map(Number);
    const otherParts = other.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
        if (currentParts[i] > otherParts[i]) return true;
        if (currentParts[i] < otherParts[i]) return false;
    }

    return false;
}

/**
 * Check if version is compatible with current version
 * @param version Version to check
 * @param minVersion Optional minimum compatible version
 */
export function isCompatibleVersion(version: string, minVersion?: string): boolean {
    const current = VERSION.toString();

    // 检查最低版本要求
    if (minVersion && isNewerVersion(minVersion, version)) {
        return false;
    }

    // 主版本号必须相同
    const currentMajor = parseInt(current.split(".")[0]);
    const versionMajor = parseInt(version.split(".")[0]);

    return currentMajor === versionMajor;
}

/**
 * Get user-friendly version status string
 */
export function getVersionStatus(version: string): string {
    const current = VERSION.toString();

    if (version === current) {
        return "当前版本";
    }

    if (isNewerVersion(current, version)) {
        return "较旧版本";
    }

    return "较新版本";
}
