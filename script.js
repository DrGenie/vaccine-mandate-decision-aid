// Global variables
let savedScenarios = [];
let currentScenario = null;
let currentInputs = null;

// DOMContentLoaded event
document.addEventListener("DOMContentLoaded", () => {
  // Initialize tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

  // Load cost parameters
  fetch('cost_params.json')
    .then(response => response.json())
    .then(data => {
      window.costParams = data;
      // Initialize cost input fields with defaults
      updateCostInputs();
    })
    .catch(error => console.error('Error loading cost parameters:', error));

  // Render charts when tabs are shown
  const wtslTab = document.querySelector('[data-bs-target="#wtslTab"]');
  wtslTab.addEventListener('shown.bs.tab', () => renderWTSLChart());

  const probTab = document.querySelector('[data-bs-target="#probTab"]');
  probTab.addEventListener('shown.bs.tab', () => updateUptakeProgressBar());

  const costsTab = document.querySelector('[data-bs-target="#costsTab"]');
  costsTab.addEventListener('shown.bs.tab', () => {
    renderCostBenefitChart();
    renderNetBenefitChart();
  });

  // Initialize Mermaid for decision tree
  mermaid.initialize({ startOnLoad: true });
});

// Utility function
function getCurrency(country) {
  return country === "Australia" ? "A$" : "€";
}

// Coefficients
const vaxCoefficients_pooled = {
  asc3: 1.067346,
  scopeAll: -0.094717,
  exemptionMedRel: -0.052939,
  exemptionAll: -0.1479027,
  coverageModerate: 0.0929465,
  coverageHigh: 0.0920977,
  livesSavedCoeff: 0.0445604
};
const vaxCoefficients_mild = {
  asc3: 0.9855033,
  scopeAll: -0.1689361,
  exemptionMedRel: -0.0376554,
  exemptionAll: -0.1753159,
  coverageModerate: 0.1245323,
  coverageHigh: 0.0662936,
  livesSavedCoeff: 0.0412682
};
const vaxCoefficients_severe = {
  asc3: 1.154312,
  scopeAll: -0.0204815,
  exemptionMedRel: -0.0681409,
  exemptionAll: -0.1219056,
  coverageModerate: 0.0610344,
  coverageHigh: 0.116988,
  livesSavedCoeff: 0.0480637
};

const colMultipliers = { Australia: 1, France: 0.95, Italy: 0.9 };

const benefitScenarios = {
  low: { AUS: 40000, EUR: 35000 },
  medium: { AUS: 50000, EUR: 45000 },
  high: { AUS: 60000, EUR: 55000 }
};

// Update cost input fields with defaults
function updateCostInputs() {
  const country = document.getElementById("country_select").value || "Australia";
  if (window.costParams && window.costParams[country]) {
    document.getElementById("fixed_vaccineProcurement").value = window.costParams[country].fixed.vaccineProcurement;
    document.getElementById("fixed_administration").value = window.costParams[country].fixed.administration;
    document.getElementById("fixed_legal").value = window.costParams[country].fixed.legal;
    document.getElementById("fixed_communication").value = window.costParams[country].fixed.communication;
    document.getElementById("fixed_monitoring").value = window.costParams[country].fixed.monitoring;
    document.getElementById("variablePerPerson").value = window.costParams[country].variablePerPerson;
  }
}

// Build scenario from parameters
function buildScenario(params) {
  const { country, adjustCOL, severity, scope, exemption, coverage, livesSaved, benefitScenario } = params;
  let coeffs;
  if (severity === "mild") coeffs = vaxCoefficients_mild;
  else if (severity === "severe") coeffs = vaxCoefficients_severe;
  else coeffs = vaxCoefficients_pooled;

  const scopeAll = scope === "all";
  const scopeText = scopeAll ? "All occupations & public spaces" : "High-risk occupations only";

  const exemptionText = exemption === "medRel" ? "Medical + religious" : exemption === "all" ? "Medical + religious + personal beliefs" : "Medical only";

  const coverageText = coverage === "70" ? "70% vaccinated" : coverage === "90" ? "90% vaccinated" : "50% vaccinated";

  // Compute utility
  let u = coeffs.asc3;
  if (scopeAll) u += coeffs.scopeAll;
  if (exemption === "medRel") u += coeffs.exemptionMedRel;
  if (exemption === "all") u += coeffs.exemptionAll;
  if (coverage === "70") u += coeffs.coverageModerate;
  if (coverage === "90") u += coeffs.coverageHigh;
  u += livesSaved * coeffs.livesSavedCoeff;

  // Uptake probability
  const uptakeProb = Math.exp(u) / (1 + Math.exp(u));
  const uptakePct = (uptakeProb * 100).toFixed(1);
  const participants = Math.round(uptakeProb * 322);

  // Cost-benefit with custom inputs
  const fixedCosts = {
    vaccineProcurement: parseFloat(document.getElementById("fixed_vaccineProcurement").value) || window.costParams[country].fixed.vaccineProcurement,
    administration: parseFloat(document.getElementById("fixed_administration").value) || window.costParams[country].fixed.administration,
    legal: parseFloat(document.getElementById("fixed_legal").value) || window.costParams[country].fixed.legal,
    communication: parseFloat(document.getElementById("fixed_communication").value) || window.costParams[country].fixed.communication,
    monitoring: parseFloat(document.getElementById("fixed_monitoring").value) || window.costParams[country].fixed.monitoring
  };
  const variablePerPerson = parseFloat(document.getElementById("variablePerPerson").value) || window.costParams[country].variablePerPerson;

  let fixedCostSum = 0;
  for (const key in fixedCosts) {
    fixedCostSum += fixedCosts[key];
  }
  const m = adjustCOL === "yes" ? colMultipliers[country] : 1;
  fixedCostSum *= m;
  const varCost = variablePerPerson * participants * m;
  const totalCost = fixedCostSum + varCost;
  const totalLives = (livesSaved / 100000) * 322;
  const QALYsPerLife = 10;
  const totalQALYs = totalLives * QALYsPerLife;
  const currencyKey = country === "Australia" ? "AUS" : "EUR";
  const valuePerQALY = benefitScenarios[benefitScenario][currencyKey];
  const totalBenefit = totalQALYs * valuePerQALY;
  const netBenefit = totalBenefit - totalCost;

  return {
    country,
    severity,
    scopeText,
    exemptionText,
    coverageText,
    livesSaved,
    uptakePct,
    participants,
    fixedCost: fixedCostSum,
    variableCost: varCost,
    totalCost,
    totalLives,
    QALYsPerLife,
    totalQALYs,
    valuePerQALY,
    totalBenefit,
    netBenefit
  };
}

// Build scenario from inputs
function buildScenarioFromInputs() {
  const country = document.getElementById("country_select").value || "Australia";
  const adjustCOL = document.getElementById("adjustCOL")?.value || "no";
  const severity = document.getElementById("severitySelect").value;
  const scope = document.querySelector('input[name="scope"]:checked')?.value || "";
  const exemption = document.querySelector('input[name="exemption"]:checked')?.value || "";
  const coverage = document.querySelector('input[name="coverage"]:checked')?.value || "";
  const livesSaved = parseInt(document.getElementById("livesSaved").value, 10);
  const benefitScenario = document.getElementById("benefitScenario").value;

  return buildScenario({ country, adjustCOL, severity, scope, exemption, coverage, livesSaved, benefitScenario });
}

// Calculate scenario and show results
function calculateScenario() {
  currentScenario = buildScenarioFromInputs();
  currentInputs = {
    country: document.getElementById("country_select").value,
    adjustCOL: document.getElementById("adjustCOL")?.value,
    severity: document.getElementById("severitySelect").value,
    scope: document.querySelector('input[name="scope"]:checked')?.value || "",
    exemption: document.querySelector('input[name="exemption"]:checked')?.value || "",
    coverage: document.querySelector('input[name="coverage"]:checked')?.value || "",
    benefitScenario: document.getElementById("benefitScenario").value
  };
  // Update uptake progress bar
  const uptakeBar = document.getElementById("uptakeBar");
  uptakeBar.style.width = `${currentScenario.uptakePct}%`;
  uptakeBar.textContent = `${currentScenario.uptakePct}%`;
  // Show modal
  const html = `
    <h4>Scenario Results</h4>
    <p><strong>Country:</strong> ${currentScenario.country}</p>
    <p><strong>Severity:</strong> ${currentScenario.severity}</p>
    <p><strong>Scope:</strong> ${currentScenario.scopeText}</p>
    <p><strong>Exemption:</strong> ${currentScenario.exemptionText}</p>
    <p><strong>Coverage:</strong> ${currentScenario.coverageText}</p>
    <p><strong>Lives Saved (per 100k):</strong> ${currentScenario.livesSaved}</p>
    <p><strong>Predicted Uptake:</strong> ${currentScenario.uptakePct}%</p>
    <p><strong>Participants (out of 322):</strong> ${currentScenario.participants}</p>
    <p><strong>Total QALYs Saved:</strong> ${currentScenario.totalQALYs.toFixed(2)}</p>
    <p><strong>Total Benefit:</strong> ${getCurrency(currentScenario.country)}${currentScenario.totalBenefit.toFixed(2)}</p>
    <p><strong>Total Cost:</strong> ${getCurrency(currentScenario.country)}${currentScenario.totalCost.toFixed(2)}</p>
    <p><strong>Net Benefit:</strong> ${getCurrency(currentScenario.country)}${currentScenario.netBenefit.toFixed(2)}</p>
  `;
  document.getElementById("modalResults").innerHTML = html;
  const modal = new bootstrap.Modal(document.getElementById("resultModal"));
  modal.show();
}

// Render WTSL chart
let wtslChart;
function renderWTSLChart() {
  const severityVal = document.getElementById("severitySelect").value;
  let coeffs;
  if (severityVal === "mild") coeffs = vaxCoefficients_mild;
  else if (severityVal === "severe") coeffs = vaxCoefficients_severe;
  else coeffs = vaxCoefficients_pooled;

  const ctx = document.getElementById("wtslChart").getContext("2d");
  if (wtslChart) wtslChart.destroy();
  const wtsl70 = -coeffs.coverageModerate / coeffs.livesSavedCoeff;
  const wtsl90 = -coeffs.coverageHigh / coeffs.livesSavedCoeff;
  const wtslScope = -coeffs.scopeAll / coeffs.livesSavedCoeff;
  const wtslMedRel = -coeffs.exemptionMedRel / coeffs.livesSavedCoeff;
  const wtslAll = -coeffs.exemptionAll / coeffs.livesSavedCoeff;
  wtslChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Δ50→70% Coverage", "Δ50→90% Coverage", "Expand to All Occupations", "Add Med+Rel Exemption", "Add Broad Exemption"],
      datasets: [{
        label: "Lives/100k",
        data: [wtsl70.toFixed(2), wtsl90.toFixed(2), wtslScope.toFixed(2), wtslMedRel.toFixed(2), wtslAll.toFixed(2)],
        backgroundColor: ["#1565C0", "#2E7D32", "#F9A825", "#6A1B9A", "#C62828"],
        borderColor: ["#0D47A1", "#1B5E20", "#F57F17", "#4A148C", "#B71C1C"],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, title: { display: true, text: "Lives per 100,000" } } },
      plugins: {
        title: { display: true, text: `Willingness to Save Lives (WTSL) – ${severityVal.charAt(0).toUpperCase() + severityVal.slice(1)}` },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} lives` } }
      }
    }
  });
}

// Update uptake progress bar
function updateUptakeProgressBar() {
  if (!currentScenario) return;
  const uptakeBar = document.getElementById("uptakeBar");
  uptakeBar.style.width = `${currentScenario.uptakePct}%`;
  uptakeBar.textContent = `${currentScenario.uptakePct}%`;
}

// Render cost-benefit chart
let costBenefitChart;
function renderCostBenefitChart() {
  if (!currentScenario) return;
  const s = currentScenario;
  const cur = getCurrency(s.country);
  const ctx = document.getElementById("costBenefitChart").getContext("2d");
  if (costBenefitChart) costBenefitChart.destroy();
  costBenefitChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Costs & Benefits"],
      datasets: [
        {
          label: "Fixed Costs",
          data: [s.fixedCost],
          backgroundColor: "#EF5350"
        },
        {
          label: "Variable Costs",
          data: [s.variableCost],
          backgroundColor: "#FFA726"
        },
        {
          label: "Benefits",
          data: [s.totalBenefit],
          backgroundColor: "#66BB6A"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: cur }
        }
      },
      plugins: {
        title: { display: true, text: "Cost-Benefit Breakdown" }
      }
    }
  });
}

// Render net benefit sensitivity chart
let netBenefitChart;
function renderNetBenefitChart() {
  if (!currentInputs) return;
  const livesSavedValues = Array.from({length: 7}, (_, i) => 10 + i * 5); // 10 to 40
  const netBenefits = livesSavedValues.map(ls => buildScenario({
    ...currentInputs,
    livesSaved: ls
  }).netBenefit);

  const ctx = document.getElementById("netBenefitChart").getContext("2d");
  if (netBenefitChart) netBenefitChart.destroy();
  netBenefitChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: livesSavedValues,
      datasets: [{
        label: "Net Benefit",
        data: netBenefits,
        borderColor: "#42A5F5",
        fill: false
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: "Lives Saved per 100k" } },
        y: { title: { display: true, text: getCurrency(currentInputs.country) } }
      },
      plugins: {
        title: { display: true, text: "Net Benefit Sensitivity to Lives Saved" }
      }
    }
  });
}

// Save scenario
function saveScenario() {
  if (!currentScenario) return alert("Please calculate a scenario first.");
  const s = { ...currentScenario, name: `Scenario ${savedScenarios.length + 1}` };
  savedScenarios.push(s);
  updateScenarioTable();
}

// Update scenario table
function updateScenarioTable() {
  const tbody = document.querySelector("#scenarioTable tbody");
  tbody.innerHTML = "";
  savedScenarios.forEach(s => {
    const row = document.createElement("tr");
    ["name", "severity", "scopeText", "exemptionText", "coverageText", "livesSaved", "uptakePct", "netBenefit"].forEach(key => {
      const td = document.createElement("td");
      td.textContent = key === "netBenefit" ? getCurrency(s.country) + s[key].toFixed(2) : s[key];
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
}

// Export to PDF
function openComparison() {
  if (savedScenarios.length < 2) return alert("Save at least two scenarios to compare.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(16).text("Scenario Comparison", 105, y, { align: "center" });
  y += 10;
  savedScenarios.forEach((s, index) => {
    doc.setFontSize(12).text(`${s.name} (Severity: ${s.severity})`, 10, y);
    y += 6;
    doc.text(`Scope: ${s.scopeText}`, 10, y); y += 5;
    doc.text(`Exemption: ${s.exemptionText}`, 10, y); y += 5;
    doc.text(`Coverage: ${s.coverageText}`, 10, y); y += 5;
    doc.text(`Lives Saved: ${s.livesSaved}`, 10, y); y += 5;
    doc.text(`Uptake: ${s.uptakePct}%`, 10, y); y += 5;
    doc.text(`Net Benefit: ${getCurrency(s.country)}${s.netBenefit.toFixed(2)}`, 10, y); y += 10;
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  });
  doc.save("Scenarios_Comparison.pdf");
}

// Download CSV
function downloadCSV() {
  if (!savedScenarios.length) return alert("No scenarios saved.");
  let csv = "Name,Severity,Scope,Exemption,Coverage,Lives,Uptake%,NetBenefit\n";
  savedScenarios.forEach(s => {
    csv += [s.name, s.severity, s.scopeText, s.exemptionText, s.coverageText, s.livesSaved, s.uptakePct, getCurrency(s.country) + s.netBenefit.toFixed(2)].join(",") + "\n";
  });
  const link = document.createElement("a");
  link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
  link.download = "scenarios.csv";
  link.click();
}

// Load preset scenarios
const presets = {
  current: { country: "Australia", adjustCOL: "no", severity: "pooled", scope: "", exemption: "", coverage: "", livesSaved: 25, benefitScenario: "medium" },
  expanded: { country: "France", adjustCOL: "yes", severity: "severe", scope: "all", exemption: "medRel", coverage: "70", livesSaved: 30, benefitScenario: "high" },
  relaxed: { country: "Italy", adjustCOL: "no", severity: "mild", scope: "", exemption: "all", coverage: "90", livesSaved: 20, benefitScenario: "low" }
};

function loadPreset(type) {
  const preset = presets[type];
  if (!preset) return;
  document.getElementById("country_select").value = preset.country;
  document.getElementById("adjustCOL").value = preset.adjustCOL;
  document.getElementById("severitySelect").value = preset.severity;
  document.querySelector('input[name="scope"][value="all"]').checked = preset.scope === "all";
  document.querySelector('input[name="exemption"][value="medRel"]').checked = preset.exemption === "medRel";
  document.querySelector('input[name="exemption"][value="all"]').checked = preset.exemption === "all";
  document.querySelector('input[name="coverage"][value="70"]').checked = preset.coverage === "70";
  document.querySelector('input[name="coverage"][value="90"]').checked = preset.coverage === "90";
  document.getElementById("livesSaved").value = preset.livesSaved;
  document.getElementById("livesSavedValue").textContent = preset.livesSaved;
  document.getElementById("benefitScenario").value = preset.benefitScenario;
  updateCostInputs();
}

// Reset inputs
function resetInputs() {
  document.getElementById("country_select").value = "Australia";
  document.getElementById("adjustCOL").value = "no";
  document.getElementById("severitySelect").value = "pooled";
  document.querySelector('input[name="scope"][value="all"]').checked = false;
  document.querySelector('input[name="exemption"][value="medRel"]').checked = false;
  document.querySelector('input[name="exemption"][value="all"]').checked = false;
  document.querySelector('input[name="coverage"][value="70"]').checked = false;
  document.querySelector('input[name="coverage"][value="90"]').checked = false;
  document.getElementById("livesSaved").value = 25;
  document.getElementById("livesSavedValue").textContent = 25;
  document.getElementById("benefitScenario").value = "medium";
  updateCostInputs();
}

// Show uptake recommendations
function showUptakeRecommendations() {
  if (!currentScenario) return alert("Please calculate a scenario first.");
  const s = currentScenario;
  let rec = "<h4>Uptake Recommendations</h4>";
  if (s.uptakePct < 40) rec += "<p><strong>Low uptake:</strong> Consider stronger communication strategies, increase incentives, and review exemption criteria to boost acceptance.</p>";
  else if (s.uptakePct < 60) rec += "<p><strong>Moderate uptake:</strong> Fine-tune coverage thresholds, consider modest incentives, and monitor compliance closely.</p>";
  else rec += "<p><strong>High uptake:</strong> Current policy appears effective. Maintain efforts, but continue monitoring for potential adjustments.</p>";
  rec += `<p><strong>Participants (out of 322):</strong> ${s.participants}</p>`;
  document.getElementById("uptakeResults").innerHTML = rec;
  const modal = new bootstrap.Modal(document.getElementById("uptakeModal"));
  modal.show();
}

// Update all visualizations when inputs change
function updateAll() {
  if (currentInputs) {
    currentScenario = buildScenarioFromInputs();
    updateUptakeProgressBar();
    renderCostBenefitChart();
    renderNetBenefitChart();
  }
}
