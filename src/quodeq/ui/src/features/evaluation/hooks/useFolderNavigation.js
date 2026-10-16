import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { apiErrorMessage } from '../../../strings/apiErrors.js';

// Path segments with "." dropped and ".." applied, so "/repo/../etc" is ["etc"].
function pathSegments(path) {
  const segments = [];
  for (const part of path.split(/[\\/]+/)) {
    if (part === '..') segments.pop();
    else if (part && part !== '.') segments.push(part);
  }
  return segments;
}

/**
 * Segment-wise containment: "/repo-other" and "/repo/../etc" are outside "/repo".
 * @param {string} path - the folder the browser is asked to open
 * @param {string} rootPath - the folder it must stay inside
 * @returns {boolean} whether `path` is `rootPath` or below it
 */
export function isWithinRoot(path, rootPath) {
  const root = pathSegments(rootPath);
  const target = pathSegments(path);
  return root.length <= target.length && root.every((part, i) => part === target[i]);
}

async function navigateFolder(path, navigation, showFiles, browseDirectory) {
  const { setLoading, setNavError, updateNavState } = navigation;
  setLoading(true);
  setNavError(null);
  try {
    const result = await browseDirectory(path || '', { files: showFiles });
    updateNavState({ data: result, pathInput: result.current, selectedFolder: result.current });
  } catch (err) {
    setNavError(apiErrorMessage(err, 'evaluate.folderLoadFailed'));
  } finally {
    setLoading(false);
  }
}

/**
 * FolderBrowser's directory listing + navigation: loads `rootPath` on mount,
 * refuses to navigate above it once set, and exposes the path-input/selected-
 * folder state the dialog and its footer read and write directly.
 */
export function useFolderNavigation({ rootPath, showFiles }) {
  const { browseDirectory } = useApi();
  const [pathInput, setPathInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [navError, setNavError] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);

  function updateNavState({ data: d, pathInput: pi, selectedFolder: sf }) {
    if (d !== undefined) setData(d);
    if (pi !== undefined) setPathInput(pi);
    if (sf !== undefined) setSelectedFolder(sf);
  }
  const navigation = { setLoading, setNavError, updateNavState };

  const navigate = useCallback((path) => {
    // Prevent navigating above rootPath when rootPath is set
    if (rootPath && path && !isWithinRoot(path, rootPath)) {
      setPathInput(rootPath);
      return;
    }
    // Fire-and-forget: navigateFolder already catches its own errors and
    // sets navError; callers (click handlers, the mount effect below) are
    // not async.
    void navigateFolder(path, navigation, showFiles, browseDirectory);
  }, [rootPath, showFiles, browseDirectory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { navigate(rootPath || ''); }, [rootPath, navigate]);

  return { data, loading, navError, pathInput, setPathInput, selectedFolder, setSelectedFolder, navigate };
}
