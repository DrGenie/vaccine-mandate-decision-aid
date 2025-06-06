// Global variables
let savedScenarios = [];
let currentScenario = null;
let wtslChart;
let costBenefitChart;
let netBenefitChart;

// DOMContentLoaded event
document.addEventListener("DOMContentLoaded", () => {
  // Initialize tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

  // Initialize Mermaid
  mermaid.initialize({ startOnLoad: true });

  // Load cost parameters
  fetch('cost_params.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to load cost_params.json');
      return response.json();
    })
    .then(data => {
      window.costParams = data;
      updateCostInputs();
      // Initial render if on relevant tabs
      if (document.querySelector('#wtslTab').classList.contains('show')) renderWTSLChart();
      if (document.querySelector('#probTab').classList.contains('show')) updateUptakeProgressBar();
      if (document.querySelector('#costsTab').classList.contains('show')) renderCostsBenefits();
    })
    .catch(error => {
      console.error('Error loading cost parameters:', error);
      alert('Failed to load cost parameters. Please check your internet connection or contact support.');
    });

  // Render charts when tabs are shown
  const wtslTab = document.querySelector('[data-bs-target="#wtslTab"]');
  wtslTab.addEventListener('shown.bs.tab', () => {
    console.log('Rendering WTSL chart');
    renderWTSLChart();
  });

  const probTab = document.querySelector('[data-bs-target="#probTab"]');
  probTab.addEventListener('shown.bs.tab', () => {
    console.log('Updating uptake progress bar');
    updateUptakeProgressBar();
  });

  const costsTab = document.querySelector('[data-bs-target="#costsTab"]');
  costsTab.addEventListener('shown.bs.tab', () => {
    console.log('Rendering cost-benefit charts');
    renderCostsBenefits();
  });

  // Add event listeners for input changes
  document.getElementById("country_select").addEventListener("change", updateAll);
  document.getElementById("severitySelect").addEventListener("change", updateAll);
  document.querySelectorAll('input[name="scope"]').forEach(input => input.addEventListener("change", updateAll));
  document.querySelectorAll('input[name="exemption"]').forEach(input => input.addEventListener("change", updateAll));
  document.querySelectorAll('input[name="coverage"]').forEach(input => input.addEventListener("change", updateAll));
  document.getElementById("livesSaved").addEventListener("input", updateAll);
  document.getElementById("benefitScenario").addEventListener("change", updateAll);
  document.getElementById("adjustCOL").addEventListener("change", updateAll);
});

// Utility functions
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
  } else {
    console.warn('Cost parameters not available for', country);
  }
}

// Build scenario from parameters
function buildScenario(params) {
  console.log('Building scenario with params:', params);
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
    vaccineProcurement: parseFloat(document.getElementById("fixed_vaccineProcurement").value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.vaccineProcurement : 0),
    administration: parseFloat(document.getElementById("fixed_administration").value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.administration : 0),
    legal: parseFloat(document.getElementById("fixed_legal").value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.legal : 0),
    communication: parseFloat(document.getElementById("fixed_communication").value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.communication : 0),
    monitoring: parseFloat(document.getElementById("fixed_monitoring").value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.monitoring : 0)
  };
  const variablePerPerson = parseFloat(document.getElementById("variablePerPerson").value) || (window.costParams && window.costParams[country] ? window.costParams[country].variablePerPerson : 0);

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
    severity: severity.charAt(0).toUpperCase() + severity.slice(1),
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
  console.log('Calculating scenario');
  currentScenario = buildScenarioFromInputs();
  if (!currentScenario) {
    alert("Failed to calculate scenario. Please check your inputs and ensure cost_params.json is loaded.");
    return;
  }
  updateUptakeProgressBar();
  const cur = getCurrency(currentScenario.country);
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
    <p><strong>Total Benefit:</strong> ${cur}${currentScenario.totalBenefit.toFixed(2)}</p>
    <p><strong>Total Cost:</strong> ${cur}${currentScenario.totalCost.toFixed(2)}</p>
    <p><strong>Net Benefit:</strong> ${cur}${currentScenario.netBenefit.toFixed(2)}</p>
  `;
  document.getElementById("modalResults").innerHTML = html;
  const modal = new bootstrap.Modal(document.getElementById("resultModal"));
  modal.show();
  // Update all visualizations
  renderWTSLChart();
  renderCostsBenefits();
}

// Render WTSL chart
function renderWTSLChart() {
  console.log('Rendering WTSL chart');
  const severityVal = document.getElementById("severitySelect").value;
  let coeffs;
  if (severityVal === "mild") coeffs = vaxCoefficients_mild;
  else if (severityVal === "severe") coeffs = vaxCoefficients_severe;
  else coeffs = vaxCoefficients_pooled;

  const ctx = document.getElementById("wtslChart")?.getContext("2d");
  if (!ctx) {
    console.error("WTSL chart canvas not found");
    return;
  }
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

  // Update WTSL info
  document.getElementById("wtslInfo").innerHTML = `
    <p><strong>WTSL Interpretations (Severity: ${severityVal.charAt(0).toUpperCase() + severityVal.slice(1)}):</strong></p>
    <ul>
      <li><strong>Coverage 50→70%:</strong> Needs ~<em>${wtsl70.toFixed(2)}</em> extra lives per 100,000 to justify raising threshold.</li>
      <li><strong>Coverage 50→90%:</strong> Needs ~<em>${wtsl90.toFixed(2)}</em> extra lives per 100,000.</li>
      <li><strong>Expand to All Occupations:</strong> Needs ~<em>${wtslScope.toFixed(2)}</em> extra lives per 100,000.</li>
      <li><strong>Add Med+Rel Exemption:</strong> ${wtslMedRel >= 0 ? `Needs ~<em>${wtslMedRel.toFixed(2)}</em> extra lives per 100,000.` : `No extra lives needed (preferred).`}</li>
      <li><strong>Add Broad Exemption:</strong> ${wtslAll >= 0 ? `Needs ~<em>${wtslAll.toFixed(2)}</em> extra lives per 100,000.` : `No extra lives needed (preferred).`}</li>
    </ul>
  `;
}

// Update uptake progress bar
function updateUptakeProgressBar() {
  console.log('Updating uptake progress bar');
  if (!currentScenario) {
    document.getElementById("uptakeBar").style.width = "0%";
    document.getElementById("uptakeBar").textContent = "0%";
    return;
  }
  const uptakeBar = document.getElementById("uptakeBar");
  uptakeBar.style.width = `${currentScenario.uptakePct}%`;
  uptakeBar.textContent = `${currentScenario.uptakePct}%`;
}

// Show uptake recommendations
function showUptakeRecommendations() {
  console.log('Showing uptake recommendations');
  if (!currentScenario) {
    alert("Please calculate a scenario first.");
    return;
  }
  let rec = "<h4>Uptake Recommendations</h4>";
  if (currentScenario.uptakePct < 40) {
    rec += "<p><strong>Low uptake:</strong> Consider stronger communication strategies, increase incentives, and review exemption criteria to boost acceptance.</p>";
  } else if (currentScenario.uptakePct < 60) {
    rec += "<p><strong>Moderate uptake:</strong> Fine-tune coverage thresholds, consider modest incentives, and monitor compliance closely.</p>";
  } else {
    rec += "<p><strong>High uptake:</strong> Current policy appears effective. Maintain efforts, but continue monitoring for potential adjustments.</p>";
  }
  rec += `<p><strong>Participants (out of 322):</strong> ${currentScenario.participants}</p>`;
  document.getElementById("uptakeResults").innerHTML = rec;
  const modal = new bootstrap.Modal(document.getElementById("uptakeModal"));
  modal.show();
}

// Render cost-benefit charts
function renderCostsBenefits() {
  console.log('Rendering cost-benefit charts');
  if (!currentScenario) {
    document.getElementById("costsBenefitsResults").innerHTML = "<p>Please calculate a scenario to see results.</p>";
    return;
  }
  const s = currentScenario;
  const cur = getCurrency(s.country);
  document.getElementById("costsBenefitsResults").innerHTML = `
    <div class="card cost-card">
      <h4>Fixed Cost Components <i class="fa-solid fa-circle-info info-icon" data-bs-toggle="tooltip" title="Infrastructure, legal, communication, monitoring"></i></h4>
      <p><strong>Vaccine Procurement:</strong> ${cur}${parseFloat(document.getElementById("fixed_vaccineProcurement").value || 0).toFixed(2)}</p>
      <p><strong>Administration & Staffing:</strong> ${cur}${parseFloat(document.getElementById("fixed_administration").value || 0).toFixed(2)}</p>
      <p><strong>Legal & Compliance:</strong> ${cur}${parseFloat(document.getElementById("fixed_legal").value || 0).toFixed(2)}</p>
      <p><strong>Communication & Outreach:</strong> ${cur}${parseFloat(document.getElementById("fixed_communication").value || 0).toFixed(2)}</p>
      <p><strong>Monitoring & Data Systems:</strong> ${cur}${parseFloat(document.getElementById("fixed_monitoring").value || 0).toFixed(2)}</p>
      <p><strong>Total Fixed Cost:</strong> ${cur}${s.fixedCost.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Variable Cost Components <i class="fa-solid fa-circle-info info-icon" data-bs-toggle="tooltip" title="Time lost, testing, outreach per participant"></i></h4>
      <p><strong>Per Participant Cost:</strong> ${cur}${parseFloat(document.getElementById("variablePerPerson").value || 0).toFixed(2)}</p>
      <p><strong># Participants:</strong> ${s.participants}</p>
      <p><strong>Total Variable Cost:</strong> ${cur}${s.variableCost.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Benefit Components (QALY-Based) <i class="fa-solid fa-circle-info info-icon" data-bs-toggle="tooltip" title="Estimated QALYs and monetary value"></i></h4>
      <p><strong>Total Lives Saved:</strong> ${s.totalLives.toFixed(3)}</p>
      <p><strong>QALYs per Life:</strong> 10</p>
      <p><strong>Total QALYs Gained:</strong> ${s.totalQALYs.toFixed(1)}</p>
      <p><strong>Value per QALY:</strong> ${cur}${s.valuePerQALY.toLocaleString()}</p>
      <p><strong>Total Benefit:</strong> ${cur}${s.totalBenefit.toFixed(2)}</p>
    </div>
    <div class="card cost-card">
      <h4>Net Benefit</h4>
      <p><strong>Total Cost:</strong> ${cur}${s.totalCost.toFixed(2)}</p>
      <p><strong>Total Benefit:</strong> ${cur}${s.totalBenefit.toFixed(2)}</p>
      <p><strong>Net Benefit:</strong> <span class="${s.netBenefit >= 0 ? 'positive' : 'negative'}">${cur}${s.netBenefit.toFixed(2)}</span></p>
    </div>
  `;
  const ctx = document.getElementById("costBenefitChart")?.getContext("2d");
  if (!ctx) {
    console.error("Cost-benefit chart canvas not found");
    return;
  }
  if (costBenefitChart) costBenefitChart.destroy();
  costBenefitChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Costs & Benefits"],
      datasets: [
        {
          label: "Fixed Costs",
          data: [s.fixedCost],
          backgroundColor: "#EF5350",
          borderColor: "#D32F2F",
          borderWidth: 1
        },
        {
          label: "Variable Costs",
          data: [s.variableCost],
          backgroundColor: "#FFA726",
          borderColor: "#F57F17",
          borderWidth: 1
        },
        {
          label: "Benefits",
          data: [s.totalBenefit],
          backgroundColor: "#66BB6A",
          borderColor: "#388E3C",
          borderWidth: 1
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
        title: { display: true, text: "Cost-Benefit Breakdown" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${cur}${ctx.raw.toFixed(2)}` } }
      }
    }
  });

  // Render net benefit sensitivity chart
  const livesSavedValues = Array.from({length: 7}, (_, i) => 10 + i * 5); // 10 to 40
  const netBenefits = livesSavedValues.map(ls => buildScenario({
    ...currentInputs,
    livesSaved: ls
  }).netBenefit);
  const netCtx = document.getElementById("netBenefitChart")?.getContext("2d");
  if (!netCtx) {
    console.error("Net benefit chart canvas not found");
    return;
  }
  if (netBenefitChart) netBenefitChart.destroy();
  netBenefitChart = new Chart(netCtx, {
    type: "line",
    data: {
      labels: livesSavedValues,
      datasets: [{
        label: "Net Benefit",
        data: netBenefits,
        borderColor: "#42A5F5",
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: "Lives Saved per 100k" } },
        y: { title: { display: true, text: cur } }
      },
      plugins: {
        title: { display: true, text: "Net Benefit Sensitivity to Lives Saved" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${cur}${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}

// Save scenario
function saveScenario() {
  console.log('Saving scenario');
  if (!currentScenario) {
    alert("Please calculate a scenario first.");
    return;
  }
  const s = { ...currentScenario, name: `Scenario ${savedScenarios.length + 1}` };
  savedScenarios.push(s);
  updateScenarioTable();
}

// Update scenario table
function updateScenarioTable() {
  console.log('Updating scenario table');
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
  console.log('Opening comparison PDF');
  if (savedScenarios.length < 2) {
    alert("Save at least two scenarios to compare.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(16).text("Scenario Comparison", 105, y, { align: "center" });
  y += 10;
  savedScenarios.forEach(s => {
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
  console.log('Downloading CSV');
  if (!savedScenarios.length) {
    alert("No scenarios saved.");
    return;
  }
  let csv
