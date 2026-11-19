import React from 'react';
import { Compass } from 'lucide-react';

interface TabPurposeBannerProps {
  purpose: string;
  steps?: string[];
}

export const TabPurposeBanner: React.FC<TabPurposeBannerProps> = ({ purpose, steps }) => {
  return (
    <div className="tab-purpose-banner">
      <div className="tab-purpose-main">
        <span className="tab-purpose-badge">
          <Compass size={13} />
          <span>TAB NÀY ĐỂ LÀM GÌ?</span>
        </span>
        <span className="tab-purpose-text">{purpose}</span>
      </div>

      {steps && steps.length > 0 && (
        <div className="tab-purpose-steps">
          {steps.map((step, idx) => (
            <React.Fragment key={idx}>
              <span className="tab-purpose-step-pill">
                <strong>B{idx + 1}:</strong> {step}
              </span>
              {idx < steps.length - 1 && <span className="tab-purpose-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
