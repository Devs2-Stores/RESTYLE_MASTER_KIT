'use strict';

const SEVERITY_RANK = {
  info: 0,
  warn: 1,
  blocker: 2
};

function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

function shouldFail(findings, failOn) {
  const threshold = severityRank(failOn);
  return findings.some((item) => severityRank(item.severity) >= threshold);
}

function countBySeverity(findings) {
  return findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});
}

function summarizeByRule(findings) {
  return findings.reduce((acc, finding) => {
    acc[finding.rule] = (acc[finding.rule] || 0) + 1;
    return acc;
  }, {});
}

module.exports = {
  SEVERITY_RANK,
  severityRank,
  shouldFail,
  countBySeverity,
  summarizeByRule
};
