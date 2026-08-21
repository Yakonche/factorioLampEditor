import React from 'react';

interface HeaderProps {
    onReset: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onReset }) => {
    return (
        <header className="bg-gray-900 border-b border-gray-700 shadow-xl z-20 shrink-0">
            <div className="flex items-center justify-between px-4 py-3 h-16">
                {/* Logo Section */}
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

            </div>
        </header>
    );
};
