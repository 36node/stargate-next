{{/*
Expand the chart name.
*/}}
{{- define "stargate-next.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified application name.
*/}}
{{- define "stargate-next.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := include "stargate-next.name" . }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create a chart name and version for labels.
*/}}
{{- define "stargate-next.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "stargate-next.labels" -}}
helm.sh/chart: {{ include "stargate-next.chart" . }}
{{ include "stargate-next.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "stargate-next.selectorLabels" -}}
app.kubernetes.io/name: {{ include "stargate-next.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Return an image reference. A digest takes precedence over a tag.
*/}}
{{- define "stargate-next.image" -}}
{{- $registry := .image.registry | default .global.imageRegistry -}}
{{- $separator := ":" -}}
{{- $reference := .image.tag | toString -}}
{{- if .image.digest }}
{{- $separator = "@" -}}
{{- $reference = .image.digest | toString -}}
{{- end }}
{{- if $registry }}
{{- printf "%s/%s%s%s" $registry .image.repository $separator $reference -}}
{{- else }}
{{- printf "%s%s%s" .image.repository $separator $reference -}}
{{- end }}
{{- end }}

{{/*
Render the union of global and component image pull secrets.
*/}}
{{- define "stargate-next.imagePullSecrets" -}}
{{- $pullSecrets := concat (.global.imagePullSecrets | default (list)) (.image.pullSecrets | default (list)) | uniq -}}
{{- if $pullSecrets }}
imagePullSecrets:
{{- range $pullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Return the Stargate Next service name.
*/}}
{{- define "stargate-next.serviceName" -}}
{{- "stargate-next" }}
{{- end }}

{{/*
Return the Playground service name.
*/}}
{{- define "stargate-next.playgroundServiceName" -}}
{{- "playground" }}
{{- end }}
