// Global variables
let savedScenarios = [];
let currentScenario = null;
let currentInputs = null;
let wtslChart = null;
let costBenefitChart = null;
let netBenefitChart = null;

// DOMContentLoaded event
document.addEventListener("DOMContentLoaded", () => {
  try {
    // Initialize tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

    // Initialize Mermaid
    mermaid.initialize({ startOnLoad: true, theme: 'default' });

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
        if (document.querySelector('#wtslTab')?.classList.contains('show')) renderWTSLChart();
        if (document.querySelector('#probTab')?.classList.contains('show')) updateUptakeProgressBar();
        if (document.querySelector('#costsTab')?.classList.contains('show')) renderCostsBenefits();
      })
      .catch(error => {
        console.error('Error loading cost parameters:', error);
        alert('Failed to load cost parameters. Please ensure cost_params.json exists and try again.');
      });

    // Render charts when tabs are shown
    const wtslTab = document.querySelector('[data-bs-target="#wtslTab"]');
    if (wtslTab) wtslTab.addEventListener('shown.bs.tab', renderWTSLChart);

    const probTab = document.querySelector('[data-bs-target="#probTab"]');
    if (probTab) probTab.addEventListener('shown.bs.tab', updateUptakeProgressBar);

    const costsTab = document.querySelector('[data-bs-target="#costsTab"]');
    if (costsTab) costsTab.addEventListener('shown.bs.tab', renderCostsBenefits);

    // Add event listeners for input changes
    const inputs = ["country_select", "severitySelect", "livesSaved", "benefitScenario", "adjustCOL"];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", updateAll);
    });

    document.querySelectorAll('input[name="scope"], input[name="exemption"], input[name="coverage"]').forEach(input => {
      input.addEventListener("change", updateAll);
    });

    const livesSaved = document.getElementById("livesSaved");
    if (livesSaved) livesSaved.addEventListener("input", () => {
      const valueEl = document.getElementById("livesSavedValue");
      if (valueEl) valueEl.textContent = livesSaved.value;
      updateAll();
    });

    // Ensure WTSL chart renders on severity change
    const severitySelect = document.getElementById("severitySelect");
    if (severitySelect) severitySelect.addEventListener("change", renderWTSLChart);
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Failed to initialize the tool. Please check the console for details.');
  }
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
  try {
    const country = document.getElementById("country_select")?.value || "Australia";
    if (window.costParams && window.costParams[country]) {
      const fields = ["vaccineProcurement", "administration", "legal", "communication", "monitoring"];
      fields.forEach(field => {
        const el = document.getElementById(`fixed_${field}`);
        if (el) el.value = window.costParams[country].fixed[field];
      });
      const varEl = document.getElementById("variablePerPerson");
      if (varEl) varEl.value = window.costParams[country].variablePerPerson;
    } else {
      console.warn('Cost parameters not available for', country);
    }
  } catch (error) {
    console.error('Error updating cost inputs:', error);
  }
}

// Build scenario from parameters
function buildScenario(params) {
  try {
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
      vaccineProcurement: parseFloat(document.getElementById("fixed_vaccineProcurement")?.value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.vaccineProcurement : 0),
      administration: parseFloat(document.getElementById("fixed_administration")?.value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.administration : 0),
      legal: parseFloat(document.getElementById("fixed_legal")?.value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.legal : 0),
      communication: parseFloat(document.getElementById("fixed_communication")?.value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.communication : 0),
      monitoring: parseFloat(document.getElementById("fixed_monitoring")?.value) || (window.costParams && window.costParams[country] ? window.costParams[country].fixed.monitoring : 0)
    };
    const variablePerPerson = parseFloat(document.getElementById("variablePerPerson")?.value) || (window.costParams && window.costParams[country] ? window.costParams[country].variablePerPerson : 0);

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
  } catch (error) {
    console.error('Error building scenario:', error);
    return null;
  }
}

// Build scenario from inputs
function buildScenarioFromInputs() {
  try {
    const country = document.getElementById("country_select")?.value || "Australia";
    const adjustCOL = document.getElementById("adjustCOL")?.value || "no";
    const severity = document.getElementById("severitySelect")?.value || "pooled";
    const scope = document.querySelector('input[name="scope"]:checked')?.value || "";
    const exemption = document.querySelector('input[name="exemption"]:checked')?.value || "";
    const coverage = document.querySelector('input[name="coverage"]:checked')?.value || "";
    const livesSaved = parseInt(document.getElementById("livesSaved")?.value || "25", 10);
    const benefitScenario = document.getElementById("benefitScenario")?.value || "medium";

    return buildScenario({ country, adjustCOL, severity, scope, exemption, coverage, livesSaved, benefitScenario });
  } catch (error) {
    console.error('Error building scenario from inputs:', error);
    return null;
  }
}

// Calculate scenario and show results
function calculateScenario() {
  try {
    console.log('Calculating scenario');
    const modalEl = document.getElementById("resultModal");
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    currentScenario = buildScenarioFromInputs();
    if (!currentScenario) {
      alert("Failed to calculate scenario. Please check your inputs and ensure cost_params.json is loaded.");
      return;
    }

    currentInputs = {
      country: document.getElementById("country_select")?.value,
      adjustCOL: document.getElementById("adjustCOL")?.value,
      severity: document.getElementById("severitySelect")?.value,
      scope: document.querySelector('input[name="scope"]:checked')?.value || "",
      exemption: document.querySelector('input[name="exemption"]:checked')?.value || "",
      coverage: document.querySelector('input[name="coverage"]:checked')?.value || "",
      livesSaved: parseInt(document.getElementById("livesSaved")?.value || "25", 10),
      benefitScenario: document.getElementById("benefitScenario")?.value
    };

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
    const modalResults = document.getElementById("modalResults");
    if (modalResults) {
      modalResults.innerHTML = html;
      modalResults.scrollTop = 0;
    }
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
    updateAll();
  } catch (error) {
    console.error('Error calculating scenario:', error);
    alert('Failed to calculate scenario. Please check the console for details.');
  }
}

// Render WTSL chart
function renderWTSLChart() {
  try {
    console.log('Rendering WTSL chart');
    const severityVal = document.getElementById("severitySelect")?.value || "pooled";
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
        labels: ["Coverage 50→70%", "Coverage 50→90%", "Public Space Mandate", "Med+Rel Exemption", "Broad Exemption"],
        datasets: [{
          label: "Lives/100k",
          data: [wtsl70.toFixed(2), wtsl90.toFixed(2), wtslScope.toFixed(2), wtslMedRel.toFixed(2), wtslAll.toFixed(2)],
          backgroundColor: ["#42a5f5", "#66bb6a", "#ffca28", "#ab47bc", "#ef5350"],
          borderColor: ["#1e88e5", "#43a047", "#ffb300", "#8e24aa", "#e53935"],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            title: { display: true, text: "Lives per 100,000" },
            ticks: { stepSize: 1 }
          }
        },
        plugins: {
          title: {
            display: true,
            text: `Willingness to Save Lives (WTSL) – ${severityVal.charAt(0).toUpperCase() + severityVal.slice(1)}`,
            font: { size: 18 }
          },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} lives` } }
        }
      }
    });

    const wtslInfo = document.getElementById("wtslInfo");
    if (wtslInfo) {
      wtslInfo.innerHTML = `
        <h5>WTSL Interpretations (Severity: ${severityVal.charAt(0).toUpperCase() + severityVal.slice(1)})</h5>
        <ul>
          <li><strong>Scope (Public Space Mandates):</strong> WTSL = ${wtslScope.toFixed(2)} → Respondents require ~${Math.abs(wtslScope).toFixed(1)} additional lives saved per 100,000 to support a public space mandate over a high-risk worker-only mandate.</li>
          <li><strong>Exemption (Medical + Religious + Personal Belief):</strong> WTSL = ${wtslAll.toFixed(2)} → Respondents require ~${Math.abs(wtslAll).toFixed(1)} additional lives saved to support broad exemptions including personal beliefs. This is statistically significant.</li>
          <li><strong>Coverage: 70% (vs. 50%):</strong> WTSL = ${wtsl70.toFixed(2)} → Respondents would accept a 50% coverage threshold unless ~${Math.abs(wtsl70).toFixed(1)} extra lives per 100,000 are saved with 70% coverage.</li>
          <li><strong>Coverage: 90% (vs. 50%):</strong> WTSL = ${wtsl90.toFixed(2)} → Respondents would accept a 50% coverage threshold unless ~${Math.abs(wtsl90).toFixed(1)} extra lives per 100,000 are saved with 90% coverage.</li>
        </ul>
      `;
    }
  } catch (error) {
    console.error('Error rendering WTSL chart:', error);
  }
}

// Update uptake progress bar
function updateUptakeProgressBar() {
  try {
    console.log('Updating uptake progress bar');
    const uptakeBar = document.getElementById("uptakeBar");
    if (!uptakeBar) return;
    if (!currentScenario) {
      uptakeBar.style.width = "0%";
      uptakeBar.textContent = "0%";
      uptakeBar.setAttribute("aria-valuenow", "0");
      return;
    }
    uptakeBar.style.width = `${currentScenario.uptakePct}%`;
    uptakeBar.textContent = `${currentScenario.uptakePct}%`;
    uptakeBar.setAttribute("aria-valuenow", currentScenario.uptakePct);
  } catch (error) {
    console.error('Error updating uptake progress bar:', error);
  }
}

// Show uptake recommendations
function showUptakeRecommendations() {
  try {
    console.log('Showing uptake recommendations');
    if (!currentScenario) {
      alert("Please calculate a scenario first.");
      return;
    }
    let rec = "<h4>Uptake Recommendations</h4>";
    const uptake = parseFloat(currentScenario.uptakePct);
    if (uptake < 40) {
      rec += "<p><strong>Low uptake:</strong> Strengthen communication campaigns, offer incentives, and tighten exemption criteria to increase acceptance.</p>";
    } else if (uptake < 60) {
      rec += "<p><strong>Moderate uptake:</strong> Optimize coverage thresholds, introduce targeted incentives, and enhance compliance monitoring.</p>";
    } else {
      rec += "<p><strong>High uptake:</strong> Policy is effective. Continue current strategies and monitor for sustained compliance.</p>";
    }
    rec += `<p><strong>Participants (out of 322):</strong> ${currentScenario.participants}</p>`;
    const uptakeResults = document.getElementById("uptakeResults");
    if (uptakeResults) uptakeResults.innerHTML = rec;
    const modalEl = document.getElementById("uptakeModal");
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  } catch (error) {
    console.error('Error showing uptake recommendations:', error);
  }
}

// Render cost-benefit charts
function renderCostsBenefits() {
  try {
    console.log('Rendering cost-benefit charts');
    const resultsEl = document.getElementById("costsBenefitsResults");
    if (!resultsEl) return;
    if (!currentScenario) {
      resultsEl.innerHTML = "<p>Please calculate a scenario to see results.</p>";
      return;
    }
    const s = currentScenario;
    const cur = getCurrency(s.country);
    resultsEl.innerHTML = `
      <div class="card cost-card">
        <h4>Fixed Cost Components <i class="fa-solid fa-circle-info info-icon" data-bs-toggle="tooltip" title="Infrastructure, legal, communication, monitoring"></i></h4>
        <p><strong>Vaccine Procurement:</strong> ${cur}${parseFloat(document.getElementById("fixed_vaccineProcurement")?.value || 0).toFixed(2)}</p>
        <p><strong>Administration & Staffing:</strong> ${cur}${parseFloat(document.getElementById("fixed_administration")?.value || 0).toFixed(2)}</p>
        <p><strong>Legal & Compliance:</strong> ${cur}${parseFloat(document.getElementById("fixed_legal")?.value || 0).toFixed(2)}</p>
        <p><strong>Communication & Outreach:</strong> ${cur}${parseFloat(document.getElementById("fixed_communication")?.value || 0).toFixed(2)}</p>
        <p><strong>Monitoring & Data Systems:</strong> ${cur}${parseFloat(document.getElementById("fixed_monitoring")?.value || 0).toFixed(2)}</p>
        <p><strong>Total Fixed Cost:</strong> ${cur}${s.fixedCost.toFixed(2)}</p>
      </div>
      <div class="card cost-card">
        <h4>Variable Cost Components <i class="fa-solid fa-circle-info info-icon" data-bs-toggle="tooltip" title="Time lost, testing, outreach per participant"></i></h4>
        <p><strong>Per Participant Cost:</strong> ${cur}${parseFloat(document.getElementById("variablePerPerson")?.value || 0).toFixed(2)}</p>
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
            backgroundColor: "#ef5350",
            borderColor: "#d32f2f",
            borderWidth: 1
          },
          {
            label: "Variable Costs",
            data: [s.variableCost],
            backgroundColor: "#ffa726",
            borderColor: "#f57f17",
            borderWidth: 1
          },
          {
            label: "Benefits",
            data: [s.totalBenefit],
            backgroundColor: "#66bb6a",
            borderColor: "#388e3c",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: cur },
            ticks: { callback: value => `${cur}${value.toLocaleString()}` }
          }
        },
        plugins: {
          title: { display: true, text: "Cost-Benefit Breakdown", font: { size: 18 } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${cur}${ctx.raw.toFixed(2)}` } }
        }
      }
    });

    const netCtx = document.getElementById("netBenefitChart")?.getContext("2d");
    if (!netCtx) {
      console.error("Net benefit chart canvas not found");
      return;
    }
    if (netBenefitChart) netBenefitChart.destroy();
    const livesSavedValues = Array.from({length: 7}, (_, i) => 10 + i * 5); // 10 to 40
    const netBenefits = livesSavedValues.map(ls => buildScenario({
      ...currentInputs,
      livesSaved: ls
    })?.netBenefit || 0);
    netBenefitChart = new Chart(netCtx, {
      type: "line",
      data: {
        labels: livesSavedValues,
        datasets: [{
          label: "Net Benefit",
          data: netBenefits,
          borderColor: "#42a5f5",
          backgroundColor: "rgba(66, 165, 245, 0.2)",
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Lives Saved per 100k" } },
          y: {
            title: { display: true, text: cur },
            ticks: { callback: value => `${cur}${value.toLocaleString()}` }
          }
        },
        plugins: {
          title: { display: true, text: "Net Benefit Sensitivity to Lives Saved", font: { size: 18 } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${cur}${ctx.raw.toFixed(2)}` } }
        }
      }
    });
  } catch (error) {
    console.error('Error rendering cost-benefit charts:', error);
  }
}

// Save scenario
function saveScenario() {
  try {
    console.log('Saving scenario');
    if (!currentScenario) {
      alert("Please calculate a scenario first.");
      return;
    }
    const s = { ...currentScenario, name: `Scenario ${savedScenarios.length + 1}` };
    savedScenarios.push(s);
    updateScenarioTable();
  } catch (error) {
    console.error('Error saving scenario:', error);
  }
}

// Update scenario table
function updateScenarioTable() {
  try {
    console.log('Updating scenario table');
    const tbody = document.querySelector("#scenarioTable tbody");
    if (!tbody) return;
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
  } catch (error) {
    console.error('Error updating scenario table:', error);
  }
}

// Export to PDF
function openComparison() {
  try {
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
  } catch (error) {
    console.error('Error exporting to PDF:', error);
  }
}

// Download CSV
function downloadCSV() {
  try {
    console.log('Downloading CSV');
    if (!savedScenarios.length) {
      alert("No scenarios saved.");
      return;
    }
    let csv = "Name,Severity,Scope,Exemption,Coverage,Lives,Uptake%,NetBenefit\n";
    savedScenarios.forEach(s => {
      csv += [
        s.name,
        s.severity,
        s.scopeText,
        s.exemptionText,
        s.coverageText,
        s.livesSaved,
        s.uptakePct,
        getCurrency(s.country) + s.netBenefit.toFixed(2)
      ].join(",") + "\n";
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = "scenarios.csv";
    link.click();
  } catch (error) {
    console.error('Error downloading CSV:', error);
  }
}

// Load preset scenarios
function loadPreset(type) {
  try {
    console.log('Loading preset:', type);
    const presets = {
      current: { country: "Australia", adjustCOL: "no", severity: "pooled", scope: "", exemption: "", coverage: "", livesSaved: 25, benefitScenario: "medium" },
      expanded: { country: "France", adjustCOL: "yes", severity: "severe", scope: "all", exemption: "medRel", coverage: "70", livesSaved: 30, benefitScenario: "high" },
      relaxed: { country: "Italy", adjustCOL: "no", severity: "mild", scope: "", exemption: "all", coverage: "90", livesSaved: 20, benefitScenario: "low" }
    };
    const preset = presets[type];
    if (!preset) return;

    document.getElementById("country_select").value = preset.country;
    document.getElementById("adjustCOL").value = preset.adjustCOL;
    document.getElementById("severitySelect").value = preset.severity;
    document.querySelectorAll('input[name="scope"]').forEach(input => input.checked = input.value === preset.scope);
    document.querySelectorAll('input[name="exemption"]').forEach(input => input.checked = input.value === preset.exemption);
    document.querySelectorAll('input[name="coverage"]').forEach(input => input.checked = input.value === preset.coverage);
    document.getElementById("livesSaved").value = preset.livesSaved;
    document.getElementById("livesSavedValue").textContent = preset.livesSaved.toString();
    document.getElementById("benefitScenario").value = preset.benefitScenario;

    updateCostInputs();
    updateAll();
  } catch (error) {
    console.error('Error loading preset:', error);
  }
}

// Reset inputs
function resetInputs() {
  try {
    console.log('Resetting inputs');
    document.getElementById("country_select").value = "Australia";
    document.getElementById("adjustCOL").value = "no";
    document.getElementById("severitySelect").value = "pooled";
    document.querySelectorAll('input[name="scope"]').forEach(input => input.checked = false);
    document.querySelectorAll('input[name="exemption"]').forEach(input => input.checked = false);
    document.querySelectorAll('input[name="coverage"]').forEach(input => input.checked = false);
    document.getElementById("livesSaved").value = 25;
    document.getElementById("livesSavedValue").textContent = "25";
    document.getElementById("benefitScenario").value = "medium";

    updateCostInputs();
    updateAll();
  } catch (error) {
    console.error('Error resetting inputs:', error);
  }
}

// Update all visualizations when inputs change
function updateAll() {
  try {
    console.log('Updating all visualizations');
    currentScenario = buildScenarioFromInputs();
    updateUptakeProgressBar();
    renderWTSLChart();
    renderCostsBenefits();
  } catch (error) {
    console.error('Error updating visualizations:', error);
  }
}
