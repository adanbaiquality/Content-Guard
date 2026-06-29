import { runReviewingAudits, type AuditResult, type StoryblokWorkflowWebhookPayload } from '../server/audits';

export type StoryblokReviewingAuditWorkflowResult = {
	status: 'completed';
	audits: AuditResult[];
	summary: {
		total: number;
		passed: number;
		failed: number;
	};
};

export async function runStoryblokReviewingAudits(payload: StoryblokWorkflowWebhookPayload): Promise<StoryblokReviewingAuditWorkflowResult> {
	'use workflow';

	const audits = await runReviewingAudits(payload);
	const passed = audits.filter((audit) => audit.passed).length;

	return {
		status: 'completed',
		audits,
		summary: {
			total: audits.length,
			passed,
			failed: audits.length - passed,
		},
	};
}