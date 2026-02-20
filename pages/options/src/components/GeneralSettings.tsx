import { useState, useEffect } from 'react';
import { type GeneralSettingsConfig, generalSettingsStore, DEFAULT_GENERAL_SETTINGS } from '@extension/storage';
interface GeneralSettingsProps {
  isDarkMode?: boolean;
}

export const GeneralSettings = ({ isDarkMode = false }: GeneralSettingsProps) => {
  const [settings, setSettings] = useState<GeneralSettingsConfig>(DEFAULT_GENERAL_SETTINGS);

  useEffect(() => {
    generalSettingsStore.getSettings().then(setSettings);
  }, []);

  const updateSetting = async <K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) => {
    setSettings(prevSettings => ({ ...prevSettings, [key]: value }));
    await generalSettingsStore.updateSettings({ [key]: value } as Partial<GeneralSettingsConfig>);
    const latestSettings = await generalSettingsStore.getSettings();
    setSettings(latestSettings);
  };

  const cardClass = `rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out`;
  const headingClass = `mb-4 text-left text-lg font-medium text-black`;
  const labelClass = `text-[14px] font-medium text-black`;
  const descClass = `text-[13px] text-black/50`;
  const inputClass = `w-20 rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[14px] text-black outline-none focus:ring-2 focus:ring-black/20`;
  const toggleClass = `peer h-6 w-11 rounded-full ${isDarkMode ? 'bg-slate-600' : 'bg-gray-200'} after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-black/20`;

  return (
    <section className="space-y-6">
      <div className={cardClass}>
        <h2 className={headingClass}>{'General'}</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Max Steps per Task'}</h3>
              <p className={descClass}>{'Step limit per task'}</p>
            </div>
            <label htmlFor="maxSteps" className="sr-only">
              {'Max Steps per Task'}
            </label>
            <input
              id="maxSteps"
              type="number"
              min={1}
              max={50}
              value={settings.maxSteps}
              onChange={e => updateSetting('maxSteps', Number.parseInt(e.target.value, 10))}
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Max Actions per Step'}</h3>
              <p className={descClass}>{'Action limit per step'}</p>
            </div>
            <label htmlFor="maxActionsPerStep" className="sr-only">
              {'Max Actions per Step'}
            </label>
            <input
              id="maxActionsPerStep"
              type="number"
              min={1}
              max={50}
              value={settings.maxActionsPerStep}
              onChange={e => updateSetting('maxActionsPerStep', Number.parseInt(e.target.value, 10))}
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Failure Tolerance'}</h3>
              <p className={descClass}>{'How many consecutive failures before stopping'}</p>
            </div>
            <label htmlFor="maxFailures" className="sr-only">
              {'Failure Tolerance'}
            </label>
            <input
              id="maxFailures"
              type="number"
              min={1}
              max={10}
              value={settings.maxFailures}
              onChange={e => updateSetting('maxFailures', Number.parseInt(e.target.value, 10))}
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Enable Vision'}</h3>
              <p className={descClass}>{'Use vision capability of LLMs (consumes more tokens for better results)'}</p>
            </div>
            <div className="relative inline-flex cursor-pointer items-center">
              <input
                id="useVision"
                type="checkbox"
                checked={settings.useVision}
                onChange={e => updateSetting('useVision', e.target.checked)}
                className="peer sr-only"
              />
              <label htmlFor="useVision" className={toggleClass}>
                <span className="sr-only">{'Enable Vision'}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Display Highlights'}</h3>
              <p className={descClass}>
                {'Show visual highlights on interactive elements (e.g. buttons, links, etc.)'}
              </p>
            </div>
            <div
              className={`relative inline-flex items-center ${settings.useVision ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                id="displayHighlights"
                type="checkbox"
                checked={settings.displayHighlights}
                disabled={settings.useVision}
                onChange={e => updateSetting('displayHighlights', e.target.checked)}
                className="peer sr-only"
              />
              <label htmlFor="displayHighlights" className={toggleClass}>
                <span className="sr-only">{'Display Highlights'}</span>
              </label>
            </div>
          </div>
          {settings.useVision && <p className="text-xs text-black/40">{'Required when Vision is enabled'}</p>}

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Replanning Frequency'}</h3>
              <p className={descClass}>{'Reconsider and update the plan every [Number] steps'}</p>
            </div>
            <label htmlFor="planningInterval" className="sr-only">
              {'Replanning Frequency'}
            </label>
            <input
              id="planningInterval"
              type="number"
              min={1}
              max={20}
              value={settings.planningInterval}
              onChange={e => updateSetting('planningInterval', Number.parseInt(e.target.value, 10))}
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Page Load Wait Time'}</h3>
              <p className={descClass}>{'Minimum wait time after page loads (250-5000ms)'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <label htmlFor="minWaitPageLoad" className="sr-only">
                {'Page Load Wait Time'}
              </label>
              <input
                id="minWaitPageLoad"
                type="number"
                min={250}
                max={5000}
                step={50}
                value={settings.minWaitPageLoad}
                onChange={e => updateSetting('minWaitPageLoad', Number.parseInt(e.target.value, 10))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Show Cost Estimate'}</h3>
              <p className={descClass}>{'Display estimated token usage and cost during task execution'}</p>
            </div>
            <div className="relative inline-flex cursor-pointer items-center">
              <input
                id="showCostEstimate"
                type="checkbox"
                checked={settings.showCostEstimate}
                onChange={e => updateSetting('showCostEstimate', e.target.checked)}
                className="peer sr-only"
              />
              <label htmlFor="showCostEstimate" className={toggleClass}>
                <span className="sr-only">{'Show Cost Estimate'}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={labelClass}>{'Replay Historical Tasks( experimental )'}</h3>
              <p className={descClass}>
                {'Enable storing and replaying of agent step history (experimental, may have issues)'}
              </p>
            </div>
            <div className="relative inline-flex cursor-pointer items-center">
              <input
                id="replayHistoricalTasks"
                type="checkbox"
                checked={settings.replayHistoricalTasks}
                onChange={e => updateSetting('replayHistoricalTasks', e.target.checked)}
                className="peer sr-only"
              />
              <label htmlFor="replayHistoricalTasks" className={toggleClass}>
                <span className="sr-only">{'Replay Historical Tasks( experimental )'}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
