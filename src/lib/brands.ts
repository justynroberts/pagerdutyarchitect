// Brand marks from Simple Icons (CC0). Tree-shaken: only these are bundled.
import {
  siDatadog, siSplunk, siDynatrace, siNewrelic, siGrafana, siPrometheus, siElastic, siSentry, siOpentelemetry, siGithubactions, siGithub, siGitlab, siJenkins, siArgo, siCircleci, siTerraform, siAnsible, siKubernetes, siDocker, siTeamcity, siHelm, siBuildkite, siFlux, siOctopusdeploy, siSpinnaker, siPagerduty, siJira, siOpsgenie, siCisco, siVault, siSnyk, siBitbucket, siGooglecloud,
} from 'simple-icons'

export type Brand = { name: string; hex: string; path: string }

export const BRANDS = {
  datadog: { name: 'Datadog', hex: '#' + siDatadog.hex, path: siDatadog.path },
  splunk: { name: 'Splunk', hex: '#' + siSplunk.hex, path: siSplunk.path },
  dynatrace: { name: 'Dynatrace', hex: '#' + siDynatrace.hex, path: siDynatrace.path },
  newrelic: { name: 'New Relic', hex: '#' + siNewrelic.hex, path: siNewrelic.path },
  grafana: { name: 'Grafana', hex: '#' + siGrafana.hex, path: siGrafana.path },
  prometheus: { name: 'Prometheus', hex: '#' + siPrometheus.hex, path: siPrometheus.path },
  elastic: { name: 'Elastic', hex: '#' + siElastic.hex, path: siElastic.path },
  sentry: { name: 'Sentry', hex: '#' + siSentry.hex, path: siSentry.path },
  opentelemetry: { name: 'OpenTelemetry', hex: '#' + siOpentelemetry.hex, path: siOpentelemetry.path },
  githubactions: { name: 'GitHub Actions', hex: '#' + siGithubactions.hex, path: siGithubactions.path },
  github: { name: 'GitHub', hex: '#' + siGithub.hex, path: siGithub.path },
  gitlab: { name: 'GitLab', hex: '#' + siGitlab.hex, path: siGitlab.path },
  jenkins: { name: 'Jenkins', hex: '#' + siJenkins.hex, path: siJenkins.path },
  argo: { name: 'Argo CD', hex: '#' + siArgo.hex, path: siArgo.path },
  circleci: { name: 'CircleCI', hex: '#' + siCircleci.hex, path: siCircleci.path },
  terraform: { name: 'Terraform', hex: '#' + siTerraform.hex, path: siTerraform.path },
  ansible: { name: 'Ansible', hex: '#' + siAnsible.hex, path: siAnsible.path },
  kubernetes: { name: 'Kubernetes', hex: '#' + siKubernetes.hex, path: siKubernetes.path },
  docker: { name: 'Docker', hex: '#' + siDocker.hex, path: siDocker.path },
  teamcity: { name: 'TeamCity', hex: '#' + siTeamcity.hex, path: siTeamcity.path },
  helm: { name: 'Helm', hex: '#' + siHelm.hex, path: siHelm.path },
  buildkite: { name: 'Buildkite', hex: '#' + siBuildkite.hex, path: siBuildkite.path },
  flux: { name: 'Flux', hex: '#' + siFlux.hex, path: siFlux.path },
  octopusdeploy: { name: 'Octopus Deploy', hex: '#' + siOctopusdeploy.hex, path: siOctopusdeploy.path },
  spinnaker: { name: 'Spinnaker', hex: '#' + siSpinnaker.hex, path: siSpinnaker.path },
  pagerduty: { name: 'PagerDuty', hex: '#' + siPagerduty.hex, path: siPagerduty.path },
  jira: { name: 'Jira', hex: '#' + siJira.hex, path: siJira.path },
  opsgenie: { name: 'Opsgenie', hex: '#' + siOpsgenie.hex, path: siOpsgenie.path },
  cisco: { name: 'Cisco', hex: '#' + siCisco.hex, path: siCisco.path },
  vault: { name: 'Vault', hex: '#' + siVault.hex, path: siVault.path },
  snyk: { name: 'Snyk', hex: '#' + siSnyk.hex, path: siSnyk.path },
  bitbucket: { name: 'Bitbucket', hex: '#' + siBitbucket.hex, path: siBitbucket.path },
  googlecloud: { name: 'Google Cloud', hex: '#' + siGooglecloud.hex, path: siGooglecloud.path },
} as const satisfies Record<string, Brand>

export type BrandKey = keyof typeof BRANDS
export const BRAND_KEYS = Object.keys(BRANDS) as BrandKey[]
