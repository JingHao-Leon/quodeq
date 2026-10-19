import { useState, useEffect } from 'react';
import { apiErrorMessage } from '../../../strings/apiErrors.js';

/**
 * useReEvalInfo — loads/reloads a project's info for ReEvaluateCard, plus
 * the "restore a missing local path from its remote URL" flow and the
 * `relocate` the locate step (LocateCodeSection) uses.
 */
export function useReEvalInfo(project, initialInfo, { getProjectInfo, relocateProject }) {
  const [info, setInfo] = useState(initialInfo || null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState(null);
  const [urlSaving, setUrlSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    // Always fetch full info (listing doesn't include hasFingerprints)
    getProjectInfo(project)
      .then((result) => {
        setInfo(result);
        setError(null);
      })
      .catch((err) => {
        // Always trace the real failure, even when a usable initialInfo
        // fallback means the UI keeps showing it silently (see below) --
        // that fallback must not cost us the only record that a refresh
        // (including one from the user's own explicit retry()) failed.
        console.error('Failed to load project info:', err);
        if (!initialInfo) {
          setInfo(null);
          setError(apiErrorMessage(err, 'evaluate.projectInfoLoadFailed'));
        }
      });
  }, [project, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  // Point the project at a folder or repository URL, then re-read its info.
  // Throws the API error so each caller words its own failure.
  async function relocate(target) {
    await relocateProject(project, target);
    setInfo(await getProjectInfo(project));
  }

  async function handleUrlRestore() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlSaving(true);
    setUrlError(null);
    try {
      await relocate(url);
      setUrlInput('');
    } catch (err) {
      setUrlError(apiErrorMessage(err, 'evaluate.urlUpdateFailed'));
    } finally {
      setUrlSaving(false);
    }
  }

  return { info, error, retry, relocate, urlInput, setUrlInput, urlError, urlSaving, handleUrlRestore };
}
