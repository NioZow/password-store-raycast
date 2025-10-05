import { ActionPanel, Action, Icon, List, showToast, Toast, Clipboard } from "@raycast/api";
import { execSync } from "child_process";
import { useState, useEffect } from "react";
import { homedir } from "os";
import { join } from "path";

import os from "os";

// cuz I use nix and want to append some path
const ENV = { ...process.env, PATH: `${process.env.PATH}:/etc/profiles/per-user/${os.userInfo().username}/bin` };
const PASSWORD_STORE_DIR = process.env.PASSWORD_STORE_DIR || join(homedir(), ".password-store");

interface IPasswordEntry {
  id: string;
  path: string;
  name: string;
}

// get all password entries
const getPasswordEntries = (): Array<IPasswordEntry> => {
  return execSync(`fd . ${PASSWORD_STORE_DIR} --extension gpg --exec realpath`, {
    encoding: "utf8",
    env: ENV,
  })
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/\.gpg$/, ""))
    .map((path, index) => {
      const name = path.split("/").pop() || path;
      return {
        id: index.toString(),
        path: path.split("/").slice(4).join("/"),
        name: name,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

// get a specific field from a password entry
const extractField = (field: string, entry: IPasswordEntry): string | null => {
  let extractCommand = "";
  switch (field) {
    case "password":
      extractCommand = `pass show "${entry.path}" | head -n1`;
      break;

    case "otp":
      extractCommand = `pass otp "${entry.path}"`;
      break;

    case "username":
      field = "login";

    default:
      extractCommand = `pass show "${entry.path}" | /usr/bin/grep -i "^${field}:" | /usr/bin/cut -d: -f2- | /usr/bin/sed 's/^ *//'`;
      break;
  }

  try {
    return execSync(extractCommand, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      env: ENV,
    }).trim();
  } catch (e) {
    return null;
  }
};

export default function Command() {
  const [entries, setEntries] = useState<IPasswordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // load the passwords
  useEffect(() => {
    let passwords = getPasswordEntries();
    if (passwords.length) {
      setEntries(passwords);
    } else {
      async () => {
        await showToast({
          style: Toast.Style.Failure,
          title: "Password store not found",
          message: `${PASSWORD_STORE_DIR} does not exist`,
        });
      };
    }
    setIsLoading(false);
  }, []);

  // handle field extraction and show errors/success
  const handleExtract = async (field: string, entry: IPasswordEntry) => {
    let extract = extractField(field, entry);
    if (extract) {
      Clipboard.copy(extract);
      await showToast({ style: Toast.Style.Success, title: "Clipboard", message: `Copied ${field}` });
    } else {
      await showToast({ style: Toast.Style.Failure, title: "Error", message: `Failed to get ${field}` });
    }
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search passwords...">
      {entries.map((entry) => (
        <List.Item
          key={entry.id}
          icon={Icon.Key}
          title={entry.path}
          actions={
            <ActionPanel>
              <Action title="Copy Password" onAction={() => handleExtract("password", entry)} icon={Icon.Key} />
              <Action
                title="Copy OTP"
                onAction={() => handleExtract("otp", entry)}
                icon={Icon.Key}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
              />
              <Action
                title="Copy Username"
                onAction={() => handleExtract("username", entry)}
                icon={Icon.Key}
                shortcut={{ modifiers: ["cmd"], key: "u" }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
