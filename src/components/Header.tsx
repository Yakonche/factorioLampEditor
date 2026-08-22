import React from 'react';
import { useI18n, type InterfaceLanguage } from '../i18n';

interface HeaderProps {
    onReset: () => void;
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

export const Header: React.FC<HeaderProps> = ({ onReset }) => {
    const { language, setLanguage, t } = useI18n();
    const languageButtons: Array<{ language: InterfaceLanguage; label: string; title: string }> = [
        { language: 'en', label: 'EN', title: 'Switch interface to English' },
        { language: 'fr', label: 'FR', title: 'Switch interface to French' },
    ];

    return (
        <header className="bg-gray-900 border-b border-gray-700 shadow-xl z-20 shrink-0">
            <div className="flex items-center justify-between px-4 py-3 h-16">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex h-10 items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/50 px-3 text-xs font-bold text-red-200 transition-colors hover:bg-red-900/70 hover:text-white"
                        title="Clear the entire grid and every imported frame"
                    >
                        <i className="fa-solid fa-trash-arrow-up" aria-hidden="true" />
                        <span className="hidden sm:inline">Reset</span>
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
        </header>
    );
};
