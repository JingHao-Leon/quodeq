import ReviewerFields from './ReviewerFields.jsx';
import { orderReviewers } from '../../hooks/useReviewerChoice.js';
import { findCatalogModel, useClientModels } from '../../../settings/hooks/useClientModels.js';
import { effortLabel } from '../../../settings/effortLabels.js';
import { providerLabel } from '../../providerLabels.js';
import { t } from '../../../../strings/index.js';

function summaryText({ catalog, model, effort }) {
  if (!model) return t('onboarding.reviewerNoModel');
  const effortText = effort
    ? t('onboarding.reviewerEffortNamed', { level: effortLabel(effort).toLowerCase() })
    : t('onboarding.reviewerDefaultEffort');
  return t('onboarding.reviewerSummary', { model: findCatalogModel(catalog, model)?.label || model, effort: effortText });
}

function ReviewerSummary({ id, choice }) {
  const { data: catalog } = useClientModels(id);
  return <span className="reviewer-row__summary">{summaryText({ catalog, ...choice.choiceFor(id, catalog) })}</span>;
}

function ReviewerRow({ id, selected, choice }) {
  return (
    <li className={selected ? 'reviewer-row reviewer-row--selected' : 'reviewer-row'}>
      <label className="reviewer-row__head">
        <input type="radio" name="reviewer" checked={selected} onChange={() => choice.select(id)} />
        <span className="reviewer-row__name">{providerLabel(id)}</span>
      </label>
      {selected
        ? (
          <ReviewerFields
            providerId={id} model={choice.model} effort={choice.effort}
            onModel={choice.setModel} onEffort={choice.setEffort}
          />
        )
        : <ReviewerSummary id={id} choice={choice} />}
    </li>
  );
}

/**
 * The detected providers as a radio list in a fixed, neutral order. The
 * selected row carries its model and effort fields; the others a muted
 * one-line summary. `choice` is useReviewerChoice's result.
 */
export default function ReviewerList({ detected, choice, onOpenSettings }) {
  return (
    <div className="reviewer-list">
      <ul className="reviewer-list__rows">
        {orderReviewers(detected).map((id) => (
          <ReviewerRow key={id} id={id} selected={id === choice.providerId} choice={choice} />
        ))}
      </ul>
      <div className="reviewer-list__footer">
        <button type="button" className="term-btn term-btn--secondary" onClick={onOpenSettings}>
          {t('onboarding.reviewerOtherProviders')}
        </button>
      </div>
    </div>
  );
}
