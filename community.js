// 20250322175100.0
// GreensboroBot Community Section JavaScript

// This script adds interactivity to the community section

document.addEventListener('DOMContentLoaded', function() {
    // Forum post interaction
    const forumPosts = document.querySelectorAll('.forum-post');
    
    forumPosts.forEach(post => {
        post.addEventListener('click', function() {
            // In a real implementation, this would navigate to the full post
            // For now, we'll just add a visual feedback
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
                alert('In the full implementation, this would open the complete forum post. This feature will be coming soon!');
            }, 200);
        });
    });
    
    // Event registration buttons
    const registerButtons = document.querySelectorAll('.card-footer .btn-outline');
    
    registerButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const eventTitle = this.closest('.card').querySelector('h3').textContent;
            alert(`You're registering for: ${eventTitle}. In the full implementation, this would open a registration form.`);
        });
    });
    
    // Community join form submission
    const joinForm = document.querySelector('form');
    
    if (joinForm) {
        joinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Form validation
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const role = document.getElementById('role').value;
            
            if (!name || !email || role === 'Select your role') {
                alert('Please fill in all required fields.');
                return;
            }
            
            // Success message
            alert('Thank you for joining the GreensboroBot community! In the full implementation, you would receive a confirmation email with next steps.');
            
            // Reset form
            this.reset();
        });
    }
    
    // Timeline animation on scroll
    const timelineItems = document.querySelectorAll('.timeline-item');
    
    function checkIfInView() {
        timelineItems.forEach(item => {
            const rect = item.getBoundingClientRect();
            const isInView = (
                rect.top >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
            );
            
            if (isInView) {
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }
        });
    }
    
    // Initial setup for timeline animation
    timelineItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        item.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });
    
    // Check if elements are in view on scroll
    window.addEventListener('scroll', checkIfInView);
    
    // Initial check
    checkIfInView();
    
    // Responsive navigation for mobile
    const mobileNavToggle = document.createElement('button');
    mobileNavToggle.textContent = 'Menu';
    mobileNavToggle.classList.add('mobile-nav-toggle');
    mobileNavToggle.style.display = 'none'; // Hide by default
    
    // Add to DOM only if screen width is small enough
    if (window.innerWidth < 768) {
        document.querySelector('.container').prepend(mobileNavToggle);
        mobileNavToggle.style.display = 'block';
    }
    
    // Add responsive layout adjustment
    window.addEventListener('resize', function() {
        if (window.innerWidth < 768) {
            if (!document.querySelector('.mobile-nav-toggle')) {
                document.querySelector('.container').prepend(mobileNavToggle);
            }
            mobileNavToggle.style.display = 'block';
        } else {
            mobileNavToggle.style.display = 'none';
        }
    });
});

// History:
// 20250322175100.0 - Initial script for community section
