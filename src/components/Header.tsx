import React from 'react';
import { useI18n, type InterfaceLanguage } from '../i18n';
import type { FactorioTextureAvailability } from '../utils/factorioTextures';

interface HeaderProps {
    onReset: () => void;
    gameTexturesEnabled: boolean;
    gameTexturesStatus: FactorioTextureAvailability;
    onGameTexturesChange: (enabled: boolean) => void;
}

const LanguageFlag: React.FC<{ language: InterfaceLanguage }> = ({ language }) => (
    <svg viewBox="0 0 60 36" className="h-4 w-6 rounded-[2px] shadow-sm" aria-hidden="true">
        {language === 'fr' ? (
            <>
                <rect width="20" height="36" fill="#0055a4" />
                <rect x="20" width="20" height="36" fill="#fff" />
                <rect x="40" width="20" height="36" fill="#ef4135" />
            </>
        ) : (
            <>
                <rect width="60" height="36" fill="#012169" />
                <path d="M0 0 60 36M60 0 0 36" stroke="#fff" strokeWidth="8" />
                <path d="M0 0 60 36M60 0 0 36" stroke="#c8102e" strokeWidth="4" />
                <path d="M30 0v36M0 18h60" stroke="#fff" strokeWidth="12" />
                <path d="M30 0v36M0 18h60" stroke="#c8102e" strokeWidth="7" />
            </>
        )}
    </svg>
);

export const Header: React.FC<HeaderProps> = ({
    onReset,
    gameTexturesEnabled,
    gameTexturesStatus,
    onGameTexturesChange,
}) => {
    const { language, setLanguage, t } = useI18n();
    const languageButtons: Array<{ language: InterfaceLanguage; label: string; title: string }> = [
        { language: 'en', label: 'EN', title: 'Switch interface to English' },
        { language: 'fr', label: 'FR', title: 'Switch interface to French' },
    ];
    const gameTextureTitle = gameTexturesStatus === 'loading'
        ? t('Detecting the local Factorio installation...')
        : gameTexturesStatus === 'available'
            ? t('Use textures from the detected local Factorio installation')
            : gameTexturesStatus === 'unavailable'
                ? t('Factorio was not detected. Enable this option to select its installation folder.')
                : t('Game textures could not be loaded. Enable this option to try again.');

    return (
        <header className="bg-gray-900 border-b border-gray-700 shadow-xl z-20 shrink-0">
            <div className="flex items-center justify-between px-4 py-3 h-16">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex h-10 items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/50 px-3 text-xs font-bold text-red-200 transition-colors hover:bg-red-900/70 hover:text-white"
                        title={t('Clear the entire grid and every imported frame')}
                    >
                        <i className="fa-solid fa-trash-arrow-up" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('Reset')}</span>
                    </button>
                    <div className="bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20 shrink-0">
                        <img src="bulb.png" alt="Logo" className="w-6 h-6 object-contain" />
                    </div>
                    <div>
                        <h1 className="text-lg font-extrabold text-gray-100 leading-tight tracking-tight">
                            Factorio Lamp Editor
                        </h1>
                        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest hidden sm:block">
                            Blueprint Generator
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <label
                        className={`flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[10px] font-bold transition-colors ${gameTexturesEnabled
                            ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                            : 'border-gray-700 bg-gray-950/70 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                        } ${gameTexturesStatus === 'loading' ? 'cursor-wait opacity-70' : ''}`}
                        title={gameTextureTitle}
                    >
                        <input
                            type="checkbox"
                            checked={gameTexturesEnabled}
                            disabled={gameTexturesStatus === 'loading'}
                            onChange={event => onGameTexturesChange(event.target.checked)}
                            className="h-4 w-4 accent-cyan-500"
                        />
                        <i className="fa-solid fa-lightbulb text-yellow-300" aria-hidden="true" />
                        <span>{t('Game Textures')}</span>
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${gameTexturesStatus === 'available'
                                ? 'bg-emerald-400'
                                : gameTexturesStatus === 'loading'
                                    ? 'animate-pulse bg-yellow-300'
                                    : 'bg-gray-600'
                            }`}
                            aria-hidden="true"
                        />
                    </label>
                    <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-950/70 p-1" role="group" aria-label={t('Interface language')}>
                        {languageButtons.map(button => (
                            <button
                                key={button.language}
                                type="button"
                                onClick={() => setLanguage(button.language)}
                                aria-pressed={language === button.language}
                                title={t(button.title)}
                                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${language === button.language
                                    ? 'border-yellow-400/60 bg-yellow-500/15 text-yellow-100'
                                    : 'border-transparent text-gray-400 hover:border-gray-600 hover:bg-gray-800 hover:text-white'
                                }`}
                            >
                                <LanguageFlag language={button.language} />
                                <span className="hidden sm:inline">{button.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    );
};
